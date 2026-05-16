// Player to Watch - Single Player Configuration
const FACEIT_API_KEY = '84e84dc8-0f8a-4497-85ff-5d282933a213';
const LEAGUE_KEYWORDS = ['esea', 'open', 'season', 's57', 'league', 'division', 'championship'];
const TEAM_ID = '905ca82f-1391-4a44-9840-601455a6b75e'; // TacAM Team ID

// PLAYER_ID and PLAYER_NAME are set in the HTML file inline script

// Video Management
let currentVideoIndex = 0;
const videoElement = document.getElementById('bg-video-local');

async function getVideoFiles() {
    try {
        const response = await fetch('/api/videos');
        if (!response.ok) throw new Error('Failed to fetch videos');
        return await response.json();
    } catch (error) {
        console.error('Error fetching videos:', error);
        return [];
    }
}

async function playNextVideo() {
    const videos = await getVideoFiles();
    if (videos.length === 0) {
        console.warn('No videos available');
        return;
    }

    currentVideoIndex = (currentVideoIndex + 1) % videos.length;
    const videoFile = videos[currentVideoIndex];
    
    videoElement.src = `/videos/${videoFile}`;
    videoElement.play().catch(err => console.log('Autoplay prevented:', err));
}

videoElement.addEventListener('ended', playNextVideo);

// Partner Logos
async function loadPartnerLogos() {
    try {
        const response = await fetch('/api/partners');
        if (!response.ok) throw new Error('Failed to fetch partners');
        const partners = await response.json();
        
        const partnerBar = document.getElementById('partnerBar');
        const fallback = document.getElementById('tacamFallback');
        
        if (partners.length > 0) {
            // Real partner logos available - remove fallback
            if (fallback) {
                fallback.remove();
            }
            partners.forEach(partner => {
                const img = document.createElement('img');
                img.src = `/partners/${partner}`;
                img.className = 'partner-logo';
                img.alt = partner.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
                partnerBar.appendChild(img);
            });
        } else {
            // No partners, show fallback
            if (fallback) {
                fallback.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading partner logos:', error);
        const fallback = document.getElementById('tacamFallback');
        if (fallback) {
            fallback.style.display = 'block';
        }
    }
}

// Fetch team match history from FACEIT API
async function fetchTeamMatches() {
    const headers = {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
        'Accept': 'application/json'
    };

    try {
        // First get team info to verify team exists
        const teamResponse = await fetch(`https://open.faceit.com/data/v4/teams/${TEAM_ID}`, { headers });
        if (!teamResponse.ok) {
            console.error('Failed to fetch team info, status:', teamResponse.status);
            return [];
        }
        
        // Now fetch match history using correct endpoint
        const matchResponse = await fetch(`https://open.faceit.com/data/v4/teams/${TEAM_ID}/stats/cs2`, { headers });
        if (!matchResponse.ok) {
            console.error('Failed to fetch team stats, status:', matchResponse.status);
            // Try alternative: get matches from championships
            const champResponse = await fetch(`https://open.faceit.com/data/v4/championships?game=cs2&offset=0&limit=20`, { headers });
            if (champResponse.ok) {
                const champData = await champResponse.json();
                console.log('Championships:', champData);
            }
            return [];
        }
        
        const statsData = await matchResponse.json();
        console.log('Team stats data:', statsData);
        
        // Extract matches from stats data
        const matches = statsData.segments || statsData.matches || [];
        console.log('Team matches fetched:', matches.length);
        
        return matches;
    } catch (error) {
        console.error('Error fetching team matches:', error);
        return [];
    }
}

// Fetch player data from FACEIT API
async function fetchPlayerData(playerId) {
    const headers = {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
        'Accept': 'application/json'
    };

    try {
        // Try fetching player profile - first try as-is, then try with ?nickname= parameter
        let playerResponse = await fetch(`https://open.faceit.com/data/v4/players?nickname=${playerId}`, { headers });
        if (!playerResponse.ok) {
            // If nickname search fails, try direct ID
            playerResponse = await fetch(`https://open.faceit.com/data/v4/players/${playerId}`, { headers });
            if (!playerResponse.ok) throw new Error(`Player not found: ${playerId}`);
        }
        const playerData = await playerResponse.json();

        // Fetch match history (last 100 matches) - use the player_id from the response
        const actualPlayerId = playerData.player_id;
        const historyResponse = await fetch(`https://open.faceit.com/data/v4/players/${actualPlayerId}/history?game=cs2&limit=100`, { headers });
        if (!historyResponse.ok) throw new Error(`History not found for: ${playerId}`);
        const historyData = await historyResponse.json();

        return {
            player: playerData,
            matches: historyData.items || []
        };
    } catch (error) {
        console.error('Error fetching player data:', error);
        return null;
    }
}

// Calculate player statistics from league matches only
async function calculateStats(playerId) {
    const data = await fetchPlayerData(playerId);
    if (!data) return null;

    const { player, matches } = data;
    const actualPlayerId = player.player_id; // Use the real player_id from the API
    
    // Use player's matches and filter for league matches
    const leagueMatches = matches.filter(match => {
        const compName = (match.competition_name || '').toLowerCase();
        const compType = match.competition_type || '';
        const hasLeagueKeyword = LEAGUE_KEYWORDS.some(keyword => compName.includes(keyword));
        const isChampionship = compType === 'championship';
        return hasLeagueKeyword || isChampionship;
    });
    
    // Use ALL league matches from this season (not just last 30)
    const seasonMatches = leagueMatches;
    
    console.log(`Processing ${seasonMatches.length} league matches for ${playerId}`);

    // Calculate statistics
    let playerTotalKills = 0;
    let playerTotalDeaths = 0;
    let teamTotalKills = 0;
    let teamTotalDeaths = 0;
    let teamWins = 0;
    let teamMatchesCount = 0;
    let playerMvps = 0;
    let playerValidMatches = 0;
    
    const maxMatches = seasonMatches.length; // Process all season matches

    for (let i = 0; i < maxMatches; i++) {
        const match = seasonMatches[i];
        
        // Count team wins for team winrate
        if (match.results && match.teams && match.teams.faction1 && match.teams.faction2) {
            teamMatchesCount++;
            if (match.results.winner === 'faction1' || match.results.winner === 'faction2') {
                // Determine which faction the player was on
                let playerFaction = null;
                
                // Check faction1
                if (match.teams.faction1.roster && Array.isArray(match.teams.faction1.roster)) {
                    if (match.teams.faction1.roster.some(p => p.player_id === actualPlayerId)) {
                        playerFaction = 'faction1';
                    }
                }
                
                // Check faction2 if not found in faction1
                if (!playerFaction && match.teams.faction2.roster && Array.isArray(match.teams.faction2.roster)) {
                    if (match.teams.faction2.roster.some(p => p.player_id === actualPlayerId)) {
                        playerFaction = 'faction2';
                    }
                }
                
                // Count win if player's faction won
                if (playerFaction && match.results.winner === playerFaction) {
                    teamWins++;
                }
            }
        }
        
        // Get detailed match stats
        try {
            const headers = {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            };
            
            const statsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, { headers });
            if (!statsResponse.ok) continue;
            
            const matchStats = await statsResponse.json();
            
            // Find player stats and team stats in the match
            let playerStats = null;
            let matchMvpPlayerId = null;
            let maxMvpCount = 0;
            let ourTeamRoster = [];
            let playerTeamIndex = -1; // Which team is our player on
            
            // First pass: find which team our player is on
            for (let teamIdx = 0; teamIdx < matchStats.rounds[0].teams.length; teamIdx++) {
                const team = matchStats.rounds[0].teams[teamIdx];
                if (team.players.some(p => p.player_id === actualPlayerId)) {
                    playerTeamIndex = teamIdx;
                    break;
                }
            }
            
            for (const round of matchStats.rounds) {
                for (let teamIdx = 0; teamIdx < round.teams.length; teamIdx++) {
                    const team = round.teams[teamIdx];
                    const isOurTeam = teamIdx === playerTeamIndex;
                    
                    for (const p of team.players) {
                        const mvpCount = parseInt(p.player_stats.MVPs || p.player_stats.mvps || 0);
                        
                        // Find MVP of the match (player with most MVPs)
                        if (mvpCount > maxMvpCount) {
                            maxMvpCount = mvpCount;
                            matchMvpPlayerId = p.player_id;
                        }
                        
                        // Find our player's stats
                        if (p.player_id === actualPlayerId) {
                            playerStats = p.player_stats;
                        }
                        
                        // Collect our team's players for team K/D
                        if (isOurTeam && !ourTeamRoster.some(player => player.player_id === p.player_id)) {
                            ourTeamRoster.push(p);
                        }
                    }
                }
            }

            // Calculate team K/D for this match
            if (ourTeamRoster.length > 0) {
                let matchTeamKills = 0;
                let matchTeamDeaths = 0;
                
                for (const p of ourTeamRoster) {
                    matchTeamKills += parseInt(p.player_stats.Kills || p.player_stats.kills || 0);
                    matchTeamDeaths += parseInt(p.player_stats.Deaths || p.player_stats.deaths || 0);
                }
                
                teamTotalKills += matchTeamKills;
                teamTotalDeaths += matchTeamDeaths;
            }

            if (playerStats) {
                const kills = parseInt(playerStats.Kills || playerStats.kills || 0);
                const deaths = parseInt(playerStats.Deaths || playerStats.deaths || 0);

                playerTotalKills += kills;
                playerTotalDeaths += deaths;
                playerValidMatches++;
                
                // Check if this player was the match MVP
                if (matchMvpPlayerId === actualPlayerId) {
                    playerMvps++;
                }
            }
        } catch (error) {
            console.log(`Could not fetch stats for match ${match.match_id}`, error);
        }
    }

    console.log(`Stats calculated: Player matches=${playerValidMatches}, Team matches=${teamMatchesCount}, MVPs=${playerMvps}`);

    // Calculate averages
    const avgKills = playerValidMatches > 0 && playerTotalKills > 0 ? (playerTotalKills / playerValidMatches).toFixed(1) : 'N/A';
    const teamKd = teamTotalDeaths > 0 ? (teamTotalKills / teamTotalDeaths).toFixed(2) : 'N/A';
    const teamWinrate = teamMatchesCount > 0 ? Math.round((teamWins / teamMatchesCount) * 100) : 0;

    return {
        player: player,
        mvps: playerMvps || 0,
        avgKills: avgKills,
        winrate: teamWinrate, // Team winrate
        kd: teamKd, // Team K/D
        validMatches: playerValidMatches
    };
}

// Display player stats
async function displayPlayer(playerId, playerName) {
    const playerNameEl = document.getElementById('playerName');
    const playerAvatarEl = document.getElementById('playerAvatar');
    const stat1 = document.getElementById('stat1');
    const stat2 = document.getElementById('stat2');
    const stat3 = document.getElementById('stat3');
    const stat4 = document.getElementById('stat4');

    // Show loading state
    playerNameEl.textContent = 'LOADING...';
    stat1.querySelector('.stat-value').textContent = '-';
    stat2.querySelector('.stat-value').textContent = '-';
    stat3.querySelector('.stat-value').textContent = '-';
    stat4.querySelector('.stat-value').textContent = '-';

    // Fetch and calculate stats
    const stats = await calculateStats(playerId);
    
    if (!stats) {
        playerNameEl.textContent = 'ERROR';
        console.error('Failed to load player stats');
        return;
    }

    // Update UI
    playerNameEl.textContent = playerName.toUpperCase();
    playerAvatarEl.src = stats.player.avatar || '/logo_T_default.png';
    playerAvatarEl.alt = playerName;

    stat1.querySelector('.stat-value').textContent = `${stats.mvps}`;
    stat2.querySelector('.stat-value').textContent = stats.avgKills;
    stat3.querySelector('.stat-value').textContent = `${stats.winrate}%`;
    stat4.querySelector('.stat-value').textContent = stats.kd;

    console.log(`Displayed stats for ${playerName}:`, stats);
}

// Initialize
async function init() {
    // Load partner logos
    await loadPartnerLogos();
    
    // Start video playback
    await playNextVideo();
    
    // Display player stats (PLAYER_ID and PLAYER_NAME are set in HTML)
    if (typeof PLAYER_ID !== 'undefined' && typeof PLAYER_NAME !== 'undefined') {
        displayPlayer(PLAYER_ID, PLAYER_NAME);
    } else {
        console.error('PLAYER_ID or PLAYER_NAME not defined!');
    }
}

// Start when page loads
window.addEventListener('DOMContentLoaded', init);
