// Player to Watch Configuration
const FACEIT_API_KEY = '84e84dc8-0f8a-4497-85ff-5d282933a213';
const REFRESH_INTERVAL = 20000; // 20 seconds per player
const LEAGUE_KEYWORDS = ['esea', 'open', 'season', 's57', 'league', 'division', 'championship'];

const PLAYERS = [
    { id: 'cLn395', displayName: 'cLn' },
    { id: 'Bravo1911', displayName: 'Bravo' },
    { id: 'Aindrew', displayName: 'Aindrew' },
    { id: 'Henzzik', displayName: 'Henzzik' },
    { id: 'Fucs2i', displayName: 'Fucsii' }
];

let currentPlayerIndex = 0;
let playerInterval = null;

// Video Management (similar to viewer.js)
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

// Partner Logos (similar to viewer.js)
async function loadPartnerLogos() {
    try {
        const response = await fetch('/api/partners');
        if (!response.ok) throw new Error('Failed to fetch partners');
        const partners = await response.json();
        
        const partnerBar = document.getElementById('partnerBar');
        const fallback = document.getElementById('tacamFallback');
        
        if (partners.length > 0) {
            fallback.style.display = 'none';
            partners.forEach(partner => {
                const img = document.createElement('img');
                img.src = `/partners/${partner}`;
                img.className = 'partner-logo';
                img.alt = partner.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
                partnerBar.appendChild(img);
            });
        } else {
            fallback.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading partner logos:', error);
        document.getElementById('tacamFallback').style.display = 'block';
    }
}

// Check if match is a league match
function isLeagueMatch(match) {
    const compName = (match.competition_name || '').toLowerCase();
    const compType = match.competition_type || '';
    
    // Check if competition name contains league keywords
    const hasLeagueKeyword = LEAGUE_KEYWORDS.some(keyword => compName.includes(keyword));
    
    // Competition type is championship (league matches)
    const isChampionship = compType === 'championship';
    
    return hasLeagueKeyword || isChampionship;
}

// Fetch player data from FACEIT API
async function fetchPlayerData(playerId) {
    const headers = {
        'Authorization': `Bearer ${FACEIT_API_KEY}`,
        'Accept': 'application/json'
    };

    try {
        // Fetch player profile
        const playerResponse = await fetch(`https://open.faceit.com/data/v4/players/${playerId}`, { headers });
        if (!playerResponse.ok) throw new Error(`Player not found: ${playerId}`);
        const playerData = await playerResponse.json();

        // Fetch match history (last 100 matches)
        const historyResponse = await fetch(`https://open.faceit.com/data/v4/players/${playerId}/history?game=cs2&limit=100`, { headers });
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
    
    // Filter only league matches
    const leagueMatches = matches.filter(isLeagueMatch);
    const last30Matches = leagueMatches.slice(0, 30);

    // Calculate statistics (limited to first 10 matches for performance)
    let totalKills = 0;
    let totalDeaths = 0;
    let wins = 0;
    let mvps = 0;
    let validMatches = 0;
    const maxMatches = Math.min(10, last30Matches.length); // Limit to 10 for speed

    for (let i = 0; i < maxMatches; i++) {
        const match = last30Matches[i];
        
        // Get detailed match stats
        try {
            const headers = {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            };
            
            const statsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, { headers });
            if (!statsResponse.ok) continue;
            
            const matchStats = await statsResponse.json();
            
            // Find player stats in the match
            let playerStats = null;
            for (const round of matchStats.rounds) {
                for (const team of round.teams) {
                    const foundPlayer = team.players.find(p => p.player_id === playerId);
                    if (foundPlayer) {
                        playerStats = foundPlayer.player_stats;
                        break;
                    }
                }
                if (playerStats) break;
            }

            if (playerStats) {
                const kills = parseInt(playerStats.Kills || playerStats.kills || 0);
                const deaths = parseInt(playerStats.Deaths || playerStats.deaths || 0);
                const result = parseInt(playerStats.Result || 0);
                const mvp = parseInt(playerStats.MVPs || playerStats.mvps || 0);

                totalKills += kills;
                totalDeaths += deaths;
                if (result === 1) wins++;
                if (mvp > 0) mvps++;
                validMatches++;
            }
        } catch (error) {
            console.log(`Could not fetch stats for match ${match.match_id}`);
        }
    }

    // Fallback: Use simple match results for winrate if detailed stats failed
    if (validMatches === 0) {
        // Count wins from match results
        for (const match of last30Matches.slice(0, 30)) {
            if (match.results && match.results.winner === 'faction1' || match.results.winner === 'faction2') {
                // Determine if player won
                const playerFaction = match.teams.faction1.roster.some(p => p.player_id === playerId) ? 'faction1' : 'faction2';
                if (match.results.winner === playerFaction) {
                    wins++;
                }
            }
            validMatches++;
        }
    }

    // Calculate averages
    const avgKills = validMatches > 0 && totalKills > 0 ? (totalKills / validMatches).toFixed(1) : 'N/A';
    const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : 'N/A';
    const winrate = validMatches > 0 ? Math.round((wins / validMatches) * 100) : 0;

    return {
        player: player,
        mvps: mvps || 'N/A',
        avgKills: avgKills,
        winrate: winrate,
        kd: kd,
        validMatches: validMatches
    };
}

// Display player stats
async function displayPlayer(playerConfig) {
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
    const stats = await calculateStats(playerConfig.id);
    
    if (!stats) {
        playerNameEl.textContent = 'ERROR';
        console.error('Failed to load player stats');
        return;
    }

    // Update UI
    playerNameEl.textContent = playerConfig.displayName.toUpperCase();
    playerAvatarEl.src = stats.player.avatar || '/logo_T_default.png';
    playerAvatarEl.alt = playerConfig.displayName;

    stat1.querySelector('.stat-value').textContent = `${stats.mvps}x`;
    stat2.querySelector('.stat-value').textContent = stats.avgKills;
    stat3.querySelector('.stat-value').textContent = `${stats.winrate}%`;
    stat4.querySelector('.stat-value').textContent = stats.kd;

    console.log(`Displayed stats for ${playerConfig.displayName}:`, stats);
}

// Rotate through players
function rotatePlayer() {
    const playerConfig = PLAYERS[currentPlayerIndex];
    displayPlayer(playerConfig);
    
    currentPlayerIndex = (currentPlayerIndex + 1) % PLAYERS.length;
}

// Initialize
async function init() {
    // Load partner logos
    await loadPartnerLogos();
    
    // Start video playback
    await playNextVideo();
    
    // Display first player immediately
    rotatePlayer();
    
    // Rotate players every REFRESH_INTERVAL
    playerInterval = setInterval(rotatePlayer, REFRESH_INTERVAL);
}

// Start when page loads
window.addEventListener('DOMContentLoaded', init);
