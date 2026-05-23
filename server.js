const express = require('express');
const path = require('path');
const fs = require('fs');
const { compressAllVideos } = require('./scripts/compress-videos');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// FACEIT API Configuration
const FACEIT_API_KEY = process.env.FACEIT_API_KEY || '84e84dc8-0f8a-4497-85ff-5d282933a213';
const CURRENT_SEASON = 's57'; // Update this when new season starts
const TEAM_ID = '905ca82f-1391-4a44-9840-601455a6b75e'; // TacAM Team ID

// Video Compression Status
let useProcessedVideos = false;

// Player Stats Cache
const playerStatsCache = new Map();
const pastMatchesCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Manual overrides
const timerOverrides = new Map(); // For manual timer control
const vetoOverrides = new Map(); // For manual veto control (show/hide)
const vetoStartOverrides = new Map(); // For manual veto start side control
const hideTimerAfterVetoOverrides = new Map(); // For hiding timer after veto completion
const manualVetoData = new Map(); // For manual pick/ban data (complete veto override)

// List of players to track
const TRACKED_PLAYERS = [
    { id: 'Aindrew', name: 'Aindrew' },
    { id: 'Fucs2i', name: 'Fucsii' },
    { id: 'cLn395', name: 'cLn' },
    { id: 'Bravo1911', name: 'Bravo' },
    { id: 'Henzzik', name: 'Henzzik' }
];

// Function to automatically scan all videos
function getVideoFiles() {
    // Prefer processed videos if available
    const processedDir = path.join(__dirname, 'videos', 'processed');
    const videosDir = path.join(__dirname, 'videos');
    
    // First, get count of original videos
    let originalVideoCount = 0;
    try {
        if (fs.existsSync(videosDir)) {
            const files = fs.readdirSync(videosDir);
            originalVideoCount = files.filter(file => {
                if (!/\.(mp4|webm|ogg|mov)$/i.test(file)) return false;
                const stat = fs.statSync(path.join(videosDir, file));
                return stat.isFile(); // Exclude directories
            }).length;
        }
    } catch (error) {
        console.error('Error counting original videos:', error);
    }
    
    // Check if processed directory exists and has ALL videos compressed
    if (fs.existsSync(processedDir) && originalVideoCount > 0) {
        try {
            const files = fs.readdirSync(processedDir);
            const videoFiles = files.filter(file => /\.(mp4|webm|ogg|mov)$/i.test(file));
            
            // Only use processed videos if ALL original videos are compressed
            if (videoFiles.length >= originalVideoCount) {
                useProcessedVideos = true;
                console.log(`[Server] Using ${videoFiles.length} compressed video(s) from /videos/processed/`);
                return videoFiles;
            } else {
                console.log(`[Server] Compression incomplete: ${videoFiles.length}/${originalVideoCount} videos compressed`);
                console.log(`[Server] Using original videos as fallback...`);
            }
        } catch (error) {
            console.error('Error reading processed videos directory:', error);
        }
    }
    
    // Fallback to original videos
    try {
        if (!fs.existsSync(videosDir)) {
            console.warn('Videos directory not found');
            return [];
        }
        const files = fs.readdirSync(videosDir);
        const videoFiles = files.filter(file => {
            if (!/\.(mp4|webm|ogg|mov)$/i.test(file)) return false;
            const stat = fs.statSync(path.join(videosDir, file));
            return stat.isFile(); // Exclude directories like 'processed'
        });
        useProcessedVideos = false;
        console.log(`[Server] Using ${videoFiles.length} original video(s) from /videos/`);
        return videoFiles;
    } catch (error) {
        console.error('Error reading videos directory:', error);
        return [];
    }
}

// Function to automatically scan all partner images
function getPartnerFiles() {
    const partnersDir = path.join(__dirname, 'public', 'partners');
    try {
        if (!fs.existsSync(partnersDir)) {
            console.warn('Partners directory not found');
            return [];
        }
        const files = fs.readdirSync(partnersDir);
        return files.filter(file => {
            // Only image files
            if (!/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)) {
                return false;
            }
            // Exclude TacAM fallback logo
            if (/TacAM[_-]?logo\.png$/i.test(file)) {
                return false;
            }
            return true;
        });
    } catch (error) {
        console.error('Error reading partners directory:', error);
        return [];
    }
}

// ========== PLAYER STATS CALCULATION ==========

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
        console.error(`[Stats] Error fetching player data for ${playerId}:`, error.message);
        return null;
    }
}

// Calculate player statistics from league matches only
async function calculatePlayerStats(playerId) {
    console.log(`[Stats] Calculating stats for ${playerId}...`);
    
    const data = await fetchPlayerData(playerId);
    if (!data) return null;

    const { player, matches } = data;
    const actualPlayerId = player.player_id; // Use the real player_id from the API
    
    // Use player's matches and filter for current season (S57 EU Open10 D)
    // Includes Regular Season, Playoffs, and all other stages
    const leagueMatches = matches.filter(match => {
        const compName = (match.competition_name || '').toLowerCase();
        
        // Filter for current season: includes all stages (Regular Season, Playoffs, etc.)
        const isCurrentSeason = compName.includes(CURRENT_SEASON) && 
                               compName.includes('eu') && 
                               compName.includes('open10') && 
                               compName.includes('d');
        
        return isCurrentSeason;
    });
    
    const seasonMatches = leagueMatches;
    console.log(`[Stats] Processing ${seasonMatches.length} ${CURRENT_SEASON.toUpperCase()} EU Open10 D matches (all stages) for ${playerId}`);

    // Calculate statistics
    let playerTotalKills = 0;
    let playerTotalDeaths = 0;
    let teamTotalKills = 0;
    let teamTotalDeaths = 0;
    let teamWins = 0;
    let teamMatchesCount = 0;
    let playerMvps = 0;
    let playerValidMatches = 0;
    
    // Track unique matches to count team wins/losses correctly
    const processedMatches = new Set();
    
    for (let i = 0; i < seasonMatches.length; i++) {
        const match = seasonMatches[i];
        
        // Get detailed match stats
        try {
            const headers = {
                'Authorization': `Bearer ${FACEIT_API_KEY}`,
                'Accept': 'application/json'
            };
            
            const statsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, { headers });
            if (!statsResponse.ok) {
                continue;
            }
            
            const matchStats = await statsResponse.json();
            
            // Find player stats and team stats in the match
            let playerStats = null;
            let matchMvpPlayerId = null;
            let maxMvpCount = 0;
            let ourTeamRoster = [];
            let playerTeamIndex = -1; // Which team is our player on
            let winningTeamIndex = -1; // Which team won
            
            // Determine which team won based on score
            if (matchStats.rounds && matchStats.rounds.length > 0) {
                const round = matchStats.rounds[0];
                if (round.teams && round.teams.length >= 2) {
                    const team1Score = parseInt(round.teams[0].team_stats?.['Team Win'] || round.teams[0].team_stats?.['Final Score'] || 0);
                    const team2Score = parseInt(round.teams[1].team_stats?.['Team Win'] || round.teams[1].team_stats?.['Final Score'] || 0);
                    
                    if (team1Score > team2Score) {
                        winningTeamIndex = 0;
                    } else if (team2Score > team1Score) {
                        winningTeamIndex = 1;
                    }
                }
            }
            
            // Find which team our player is on
            if (matchStats.rounds && matchStats.rounds.length > 0) {
                for (let teamIdx = 0; teamIdx < matchStats.rounds[0].teams.length; teamIdx++) {
                    const team = matchStats.rounds[0].teams[teamIdx];
                    if (team.players.some(p => p.player_id === actualPlayerId || p.nickname === playerId)) {
                        playerTeamIndex = teamIdx;
                        break;
                    }
                }
            }
            
            // Count team wins/losses only once per match
            if (playerTeamIndex !== -1 && !processedMatches.has(match.match_id)) {
                processedMatches.add(match.match_id);
                teamMatchesCount++;
                
                // Check if player's team won
                if (playerTeamIndex === winningTeamIndex) {
                    teamWins++;
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
                        if (p.player_id === actualPlayerId || p.nickname === playerId) {
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
            console.log(`[Stats] Could not fetch stats for match ${match.match_id}:`, error.message);
        }
    }

    const teamLosses = teamMatchesCount - teamWins;
    const teamWinrate = teamMatchesCount > 0 ? Math.round((teamWins / teamMatchesCount) * 100) : 0;
    
    console.log(`[Stats] Stats calculated for ${playerId}:`);
    console.log(`  - Player: ${playerValidMatches} matches played, ${playerMvps} MVPs`);
    console.log(`  - Team: ${teamWins}W-${teamLosses}L (${teamMatchesCount} total matches, ${teamWinrate}% winrate)`);
    console.log(`  - Team K/D: ${teamTotalKills}K/${teamTotalDeaths}D across ${teamMatchesCount} season matches`);

    // Calculate averages (all from league matches only)
    const avgKills = playerValidMatches > 0 && playerTotalKills > 0 ? (playerTotalKills / playerValidMatches).toFixed(1) : 'N/A';
    const teamKd = teamTotalDeaths > 0 ? (teamTotalKills / teamTotalDeaths).toFixed(2) : 'N/A';

    return {
        player: player,
        mvps: playerMvps || 0,
        avgKills: avgKills,
        winrate: teamWinrate, // Team winrate (league matches only)
        kd: teamKd, // Team K/D (league matches only)
        validMatches: playerValidMatches,
        teamMatchesCount: teamMatchesCount,
        teamWins: teamWins,
        cachedAt: new Date().toISOString()
    };
}

// Update stats cache for a specific player
async function updatePlayerStatsCache(playerId) {
    try {
        const stats = await calculatePlayerStats(playerId);
        if (stats) {
            playerStatsCache.set(playerId, {
                data: stats,
                timestamp: Date.now()
            });
            console.log(`[Stats Cache] Updated cache for ${playerId}`);
            return stats;
        }
    } catch (error) {
        console.error(`[Stats Cache] Failed to update cache for ${playerId}:`, error);
    }
    return null;
}

// Update all player stats caches
async function updateAllPlayerStatsCache() {
    console.log('[Stats Cache] Updating all player stats...');
    
    for (const player of TRACKED_PLAYERS) {
        await updatePlayerStatsCache(player.id);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('[Stats Cache] All player stats updated');
}

// Get cached stats or fetch if not available/expired
async function getCachedPlayerStats(playerId) {
    const cached = playerStatsCache.get(playerId);
    
    // Check if cache is valid
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        console.log(`[Stats Cache] Serving cached stats for ${playerId}`);
        return cached.data;
    }
    
    // Cache miss or expired - fetch new data
    console.log(`[Stats Cache] Cache miss/expired for ${playerId}, fetching...`);
    return await updatePlayerStatsCache(playerId);
}

// Schedule automatic cache updates every 24 hours
setInterval(updateAllPlayerStatsCache, CACHE_DURATION);

// Initial cache population on server start (async, don't wait)
setTimeout(() => {
    console.log('[Stats Cache] Starting initial cache population...');
    updateAllPlayerStatsCache().catch(err => {
        console.error('[Stats Cache] Initial population failed:', err);
    });
}, 5000); // Wait 5 seconds after server start

// ========== END PLAYER STATS CALCULATION ==========

// Middleware for JSON and static files
app.use(express.json());

// Content Security Policy middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https: http:",
            "font-src 'self' data:",
            "connect-src 'self' https://open.faceit.com",
            "media-src 'self' blob:",
            "frame-src 'self' https://www.youtube.com",
            "object-src 'none'",
            "base-uri 'self'"
        ].join('; ')
    );
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ========== URL REDIRECTS FOR REORGANIZED FILES ==========
// Redirect old URLs to new organized structure

// Scene redirects
app.get('/past-matches.html', (req, res) => res.redirect(301, '/scenes/past-matches.html'));
app.get('/upcoming-matches.html', (req, res) => res.redirect(301, '/scenes/upcoming-matches.html'));

// Player redirects
app.get('/player-to-watch-aindrew.html', (req, res) => res.redirect(301, '/players/player-to-watch-aindrew.html'));
app.get('/player-to-watch-bravo.html', (req, res) => res.redirect(301, '/players/player-to-watch-bravo.html'));
app.get('/player-to-watch-cln.html', (req, res) => res.redirect(301, '/players/player-to-watch-cln.html'));
app.get('/player-to-watch-fucsii.html', (req, res) => res.redirect(301, '/players/player-to-watch-fucsii.html'));
app.get('/player-to-watch-henzzik.html', (req, res) => res.redirect(301, '/players/player-to-watch-henzzik.html'));

// Overlay redirects
app.get('/brb.html', (req, res) => res.redirect(301, '/overlays/brb.html'));
app.get('/pause.html', (req, res) => res.redirect(301, '/overlays/pause.html'));
app.get('/clean.html', (req, res) => res.redirect(301, '/overlays/clean.html'));

// ========== END URL REDIRECTS ==========

// Serve videos from processed directory if available, otherwise from original
app.use('/videos', (req, res, next) => {
    const processedDir = path.join(__dirname, 'videos', 'processed');
    const videosDir = path.join(__dirname, 'videos');
    
    // Decode the URL-encoded path
    const decodedPath = decodeURIComponent(req.path);
    
    // Try processed directory first
    const processedPath = path.join(processedDir, decodedPath);
    if (fs.existsSync(processedPath)) {
        const stat = fs.statSync(processedPath);
        if (stat.isFile()) {
            // Set aggressive caching headers
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
            res.setHeader('Accept-Ranges', 'bytes');
            return res.sendFile(processedPath);
        }
    }
    
    // Fallback to original videos
    const originalPath = path.join(videosDir, decodedPath);
    if (fs.existsSync(originalPath)) {
        const stat = fs.statSync(originalPath);
        if (stat.isFile()) {
            // Set aggressive caching headers
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
            res.setHeader('Accept-Ranges', 'bytes');
            return res.sendFile(originalPath);
        }
    }
    
    // Debug logging
    console.error(`[Video] Not found: ${decodedPath}`);
    console.error(`[Video] Tried: ${processedPath}`);
    console.error(`[Video] Tried: ${originalPath}`);
    res.status(404).send('Video not found');
});

// Note: Timer and veto overrides are defined at the top of the file as Map()
// Old object-based storage removed to use consistent Map() approach

// In-memory storage for tech difficulties overlay per match
const techDifficulties = {};

// Timestamps for automatic cleanup after 12 hours
const matchTimestamps = {};

// Cleanup function: Removes match data older than 12 hours
function cleanupOldMatches() {
    const now = Date.now();
    const maxAge = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    let deletedCount = 0;
    
    for (const matchId in matchTimestamps) {
        const age = now - matchTimestamps[matchId];
        if (age > maxAge) {
            timerOverrides.delete(matchId);
            vetoOverrides.delete(matchId);
            vetoStartOverrides.delete(matchId);
            hideTimerAfterVetoOverrides.delete(matchId);
            delete techDifficulties[matchId];
            delete matchTimestamps[matchId];
            deletedCount++;
            console.log(`[Cleanup] Deleted old match data for: ${matchId} (age: ${Math.round(age / 3600000)}h)`);
        }
    }
    
    if (deletedCount > 0) {
        console.log(`[Cleanup] Removed ${deletedCount} old match(es)`);
    }
}

// Run cleanup every hour
setInterval(cleanupOldMatches, 60 * 60 * 1000); // Every hour
// Also run cleanup at startup
cleanupOldMatches();
console.log('[Cleanup] Auto-cleanup enabled (removes matches older than 12 hours)');

// Middleware for Basic Authentication (only for admin pages)
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required');
    }
    
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'admin';
    
    if (username === validUsername && password === validPassword) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        res.status(401).send('Invalid credentials');
    }
}

// API endpoint: Get available videos
app.get('/api/videos', (req, res) => {
    res.json(getVideoFiles());
});

// API endpoint: Get available partner logos
app.get('/api/partners', (req, res) => {
    res.json(getPartnerFiles());
});

// API endpoint: Get player stats (cached)
app.get('/api/player-stats/:playerId', async (req, res) => {
    const { playerId } = req.params;
    
    try {
        const stats = await getCachedPlayerStats(playerId);
        
        if (stats) {
            res.json({
                success: true,
                data: stats
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Player not found or stats unavailable'
            });
        }
    } catch (error) {
        console.error(`[API] Error fetching stats for ${playerId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// API endpoint: Get all tracked players stats
app.get('/api/player-stats', async (req, res) => {
    try {
        const allStats = {};
        
        for (const player of TRACKED_PLAYERS) {
            const stats = await getCachedPlayerStats(player.id);
            if (stats) {
                allStats[player.id] = stats;
            }
        }
        
        res.json({
            success: true,
            data: allStats,
            players: TRACKED_PLAYERS
        });
    } catch (error) {
        console.error('[API] Error fetching all player stats:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// API endpoint: Get past matches for team
app.get('/api/past-matches/:teamId', async (req, res) => {
    const { teamId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    // Check cache first
    const cached = pastMatchesCache.get(teamId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log(`[API] Returning cached past matches for team ${teamId}`);
        return res.json(cached.data);
    }
    
    // Filter for league matches only
    const LEAGUE_FILTER = ['s57', 'open10', 'esea', 'regular season', 'playoffs', 'kleverr'];
    
    try {
        console.log(`[API] Fetching fresh past matches for team ${teamId}`);
        
        // Use a reference player from the team to get match history
        const referencePlayer = 'cLn395'; // You can make this configurable
        
        // Fetch player data
        const headers = {
            'Authorization': `Bearer ${FACEIT_API_KEY}`,
            'Accept': 'application/json'
        };
        
        let playerResponse = await fetch(`https://open.faceit.com/data/v4/players?nickname=${referencePlayer}`, { headers });
        if (!playerResponse.ok) {
            playerResponse = await fetch(`https://open.faceit.com/data/v4/players/${referencePlayer}`, { headers });
        }
        const playerData = await playerResponse.json();
        const actualPlayerId = playerData.player_id;
        
        // Fetch more matches to ensure we get enough league matches after filtering
        const historyResponse = await fetch(`https://open.faceit.com/data/v4/players/${actualPlayerId}/history?game=cs2&limit=${limit * 3}`, { headers });
        const historyData = await historyResponse.json();
        
        if (!historyData.items || historyData.items.length === 0) {
            return res.json({
                success: true,
                matches: [],
                message: 'No matches found'
            });
        }
        
        // Process matches and fetch detailed stats
        const matches = [];
        
        for (const match of historyData.items) {
            if (matches.length >= limit) break;
            
            // Filter: Only include league matches
            const compName = (match.competition_name || '').toLowerCase();
            const isLeagueMatch = LEAGUE_FILTER.some(keyword => compName.includes(keyword));
            
            // Skip non-league matches (like "Europe 5v5 Queue")
            if (!isLeagueMatch) {
                console.log(`[API] Skipping non-league match: ${match.competition_name}`);
                continue;
            }
            
            try {
                // Fetch detailed match stats
                const statsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}/stats`, { headers });
                
                if (!statsResponse.ok) {
                    console.warn(`[API] Failed to fetch stats for match ${match.match_id}`);
                    continue;
                }
                
                const statsData = await statsResponse.json();
                
                if (!statsData.rounds || statsData.rounds.length === 0) {
                    continue;
                }
                
                const round = statsData.rounds[0];
                const teams = round.teams;
                
                if (!teams || teams.length < 2) {
                    continue;
                }
                
                // Find our team and enemy team
                let ourTeam = null;
                let enemyTeam = null;
                
                for (const team of teams) {
                    if (team.team_id === teamId) {
                        ourTeam = team;
                    } else {
                        enemyTeam = team;
                    }
                }
                
                if (!ourTeam || !enemyTeam) {
                    // Fallback: check if any player from our tracked players is in the match
                    for (const team of teams) {
                        const teamPlayerIds = team.players.map(p => p.nickname.toLowerCase());
                        const hasOurPlayers = TRACKED_PLAYERS.some(p => teamPlayerIds.includes(p.id.toLowerCase()));
                        
                        if (hasOurPlayers) {
                            ourTeam = team;
                            enemyTeam = teams.find(t => t !== team);
                            break;
                        }
                    }
                }
                
                if (!ourTeam || !enemyTeam) {
                    continue; // Skip this match if we can't identify the teams
                }
                
                // Extract scores
                const ourScore = parseInt(ourTeam.team_stats['Final Score'] || 0);
                const enemyScore = parseInt(enemyTeam.team_stats['Final Score'] || 0);
                const isWin = ourScore > enemyScore;
                
                // Extract half scores
                const ourFirstHalf = parseInt(ourTeam.team_stats['First Half Score'] || 0);
                const ourSecondHalf = parseInt(ourTeam.team_stats['Second Half Score'] || 0);
                const enemyFirstHalf = parseInt(enemyTeam.team_stats['First Half Score'] || 0);
                const enemySecondHalf = parseInt(enemyTeam.team_stats['Second Half Score'] || 0);
                
                // Extract map name
                const mapName = round.round_stats.Map || 'Unknown';
                const cleanMapName = mapName.replace('de_', '').toUpperCase();
                
                matches.push({
                    match_id: match.match_id,
                    competition_name: match.competition_name,
                    started_at: match.started_at,
                    finished_at: match.finished_at,
                    ourTeam: ourTeam.team_stats.Team || 'TacAM',
                    enemyTeam: enemyTeam.team_stats.Team || 'Opponent',
                    ourScore: ourScore,
                    enemyScore: enemyScore,
                    isWin: isWin,
                    map: cleanMapName,
                    firstHalf: {
                        our: ourFirstHalf,
                        enemy: enemyFirstHalf
                    },
                    secondHalf: {
                        our: ourSecondHalf,
                        enemy: enemySecondHalf
                    }
                });
                
            } catch (matchError) {
                console.error(`[API] Error processing match ${match.match_id}:`, matchError.message);
                continue;
            }
        }
        
        const response = {
            success: true,
            matches: matches,
            count: matches.length
        };
        
        // Cache the results
        pastMatchesCache.set(teamId, {
            data: response,
            timestamp: Date.now()
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('[API] Error fetching past matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch past matches',
            message: error.message
        });
    }
});

// API endpoint: Get upcoming matches for championship
app.get('/api/upcoming-matches/:championshipId', async (req, res) => {
    const { championshipId } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    
    // Check cache first
    const cacheKey = `upcoming_${championshipId}`;
    const cached = pastMatchesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log(`[API] Returning cached upcoming matches for championship ${championshipId}`);
        return res.json(cached.data);
    }
    
    try {
        console.log(`[API] Fetching fresh upcoming matches for championship ${championshipId}`);
        
        const headers = {
            'Authorization': `Bearer ${FACEIT_API_KEY}`,
            'Accept': 'application/json'
        };
        
        // Fetch upcoming matches from championship
        const matchesResponse = await fetch(
            `https://open.faceit.com/data/v4/championships/${championshipId}/matches?type=upcoming&offset=0&limit=${limit * 2}`,
            { headers }
        );
        
        if (!matchesResponse.ok) {
            throw new Error(`Failed to fetch championship matches: ${matchesResponse.statusText}`);
        }
        
        const matchesData = await matchesResponse.json();
        
        if (!matchesData.items || matchesData.items.length === 0) {
            const response = {
                success: true,
                matches: [],
                message: 'No upcoming matches found'
            };
            
            // Cache empty result for shorter time (1 hour)
            pastMatchesCache.set(cacheKey, {
                data: response,
                timestamp: Date.now()
            });
            
            return res.json(response);
        }
        
        // Process matches - filter for team matches if needed
        const matches = matchesData.items
            .filter(match => {
                // Only include matches with both teams assigned
                return match.teams && match.teams.faction1 && match.teams.faction2;
            })
            .slice(0, limit)
            .map(match => ({
                match_id: match.match_id,
                competition_name: match.competition_name,
                scheduled_at: match.scheduled_at,
                status: match.status,
                teams: {
                    faction1: {
                        name: match.teams.faction1.name || match.teams.faction1.nickname || 'Team 1',
                        faction_id: match.teams.faction1.faction_id
                    },
                    faction2: {
                        name: match.teams.faction2.name || match.teams.faction2.nickname || 'Team 2',
                        faction_id: match.teams.faction2.faction_id
                    }
                },
                voting: match.voting || {}
            }));
        
        const response = {
            success: true,
            matches: matches,
            count: matches.length
        };
        
        // Cache the results
        pastMatchesCache.set(cacheKey, {
            data: response,
            timestamp: Date.now()
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('[API] Error fetching upcoming matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch upcoming matches',
            message: error.message
        });
    }
});

// API endpoint: Force refresh player stats (protected)
app.post('/api/player-stats/:playerId/refresh', requireAuth, async (req, res) => {
    const { playerId } = req.params;
    
    try {
        const stats = await updatePlayerStatsCache(playerId);
        
        if (stats) {
            res.json({
                success: true,
                message: 'Stats refreshed successfully',
                data: stats
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Failed to refresh stats'
            });
        }
    } catch (error) {
        console.error(`[API] Error refreshing stats for ${playerId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// API endpoint: Get config (for client)
app.get('/api/config', (req, res) => {
    // Default showVeto to true, unless explicitly set to 'false'
    const showVeto = process.env.SHOW_VETO === 'false' ? false : true;
    res.json({
        apiKey: process.env.FACEIT_API_KEY || '',
        videoFiles: getVideoFiles(),
        partnerFiles: getPartnerFiles(),
        showVeto: showVeto,
        refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000
    });
});

// API endpoint: Get config with match-specific veto setting
app.get('/api/config/:matchId', (req, res) => {
    const { matchId } = req.params;
    
    // Set timestamp when match is accessed for the first time
    if (!matchTimestamps[matchId]) {
        matchTimestamps[matchId] = Date.now();
    }
    
    // Default showVeto to true, unless explicitly set to 'false'
    const baseShowVeto = process.env.SHOW_VETO === 'false' ? false : true;
    const showVeto = vetoOverrides.has(matchId) ? vetoOverrides.get(matchId) : baseShowVeto;
    
    // Default: 'auto' - automatically detect from API which team starts veto
    const vetoStartSide = vetoStartOverrides.get(matchId) || 'auto';
    
    // Default: false - show timer even after veto is complete
    const hideTimerAfterVeto = hideTimerAfterVetoOverrides.get(matchId) || false;
    
    res.json({
        apiKey: process.env.FACEIT_API_KEY || '',
        videoFiles: getVideoFiles(),
        partnerFiles: getPartnerFiles(),
        showVeto: showVeto,
        vetoStartSide: vetoStartSide,
        hideTimerAfterVeto: hideTimerAfterVeto,
        refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000
    });
});

// API endpoint: Set veto setting (protected)
app.post('/api/veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { showVeto } = req.body;
    
    if (showVeto === undefined) {
        return res.status(400).json({ error: 'Missing showVeto parameter' });
    }
    
    vetoOverrides.set(matchId, Boolean(showVeto));
    matchTimestamps[matchId] = Date.now(); // Timestamp for cleanup
    res.json({ success: true, matchId, showVeto: vetoOverrides.get(matchId) });
});

// API endpoint: Get veto setting
app.get('/api/veto/:matchId', (req, res) => {
    const { matchId } = req.params;
    // Default showVeto to true, unless explicitly set to 'false'
    const baseShowVeto = process.env.SHOW_VETO === 'false' ? false : true;
    const showVeto = vetoOverrides.has(matchId) ? vetoOverrides.get(matchId) : baseShowVeto;
    
    res.json({
        showVeto: showVeto,
        isOverride: vetoOverrides.has(matchId)
    });
});

// API endpoint: Reset veto setting (protected)
app.delete('/api/veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    vetoOverrides.delete(matchId);
    res.json({ success: true });
});

// API endpoint: Set veto start side (protected)
app.post('/api/veto-start/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { side } = req.body;
    
    if (!side || (side !== 'left' && side !== 'right' && side !== 'auto')) {
        return res.status(400).json({ error: 'Invalid side parameter. Must be "left", "right", or "auto"' });
    }
    
    vetoStartOverrides.set(matchId, side);
    matchTimestamps[matchId] = Date.now();
    res.json({ success: true, matchId, vetoStartSide: side });
});

// API endpoint: Get veto start side
app.get('/api/veto-start/:matchId', (req, res) => {
    const { matchId } = req.params;
    const vetoStartSide = vetoStartOverrides[matchId] || 'auto';
    
    res.json({
        vetoStartSide: vetoStartSide,
        isOverride: vetoStartOverrides[matchId] !== undefined
    });
});

// API endpoint: Reset veto start side (protected)
app.delete('/api/veto-start/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    vetoStartOverrides.delete(matchId);
    res.json({ success: true });
});

// API endpoint: Set hide timer after veto (protected)
app.post('/api/hide-timer-after-veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { hideTimer } = req.body;
    
    if (hideTimer === undefined) {
        return res.status(400).json({ error: 'Missing hideTimer parameter' });
    }
    
    hideTimerAfterVetoOverrides.set(matchId, Boolean(hideTimer));
    matchTimestamps[matchId] = Date.now();
    res.json({ success: true, matchId, hideTimerAfterVeto: hideTimerAfterVetoOverrides.get(matchId) });
});

// API endpoint: Get hide timer after veto setting
app.get('/api/hide-timer-after-veto/:matchId', (req, res) => {
    const { matchId } = req.params;
    const hideTimerAfterVeto = hideTimerAfterVetoOverrides[matchId] || false;
    
    res.json({
        hideTimerAfterVeto: hideTimerAfterVeto,
        isOverride: hideTimerAfterVetoOverrides[matchId] !== undefined
    });
});

// API endpoint: Reset hide timer after veto setting (protected)
app.delete('/api/hide-timer-after-veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    hideTimerAfterVetoOverrides.delete(matchId);
    res.json({ success: true });
});

// API endpoint: Set timer override (protected)
app.post('/api/timer/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { duration } = req.body;
    
    if (!duration || isNaN(duration)) {
        return res.status(400).json({ error: 'Invalid duration' });
    }
    
    timerOverrides.set(matchId, {
        duration: parseInt(duration),
        timestamp: Date.now()
    });
    matchTimestamps[matchId] = Date.now(); // Timestamp for cleanup
    
    res.json({ success: true, matchId, duration: parseInt(duration) });
});

// API endpoint: Get timer override
app.get('/api/timer/:matchId', (req, res) => {
    const { matchId } = req.params;
    const override = timerOverrides.get(matchId);
    
    if (!override) {
        return res.json({ hasOverride: false });
    }
    
    // Calculate remaining time
    const elapsed = Math.floor((Date.now() - override.timestamp) / 1000);
    const remaining = Math.max(0, override.duration - elapsed);
    
    res.json({
        hasOverride: true,
        originalDuration: override.duration,
        remaining: remaining,
        timestamp: override.timestamp
    });
});

// API endpoint: Delete timer override (protected)
app.delete('/api/timer/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    timerOverrides.delete(matchId);
    res.json({ success: true });
});

// API endpoint: Set tech difficulties overlay (protected)
app.post('/api/tech-difficulties/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { active } = req.body;
    
    if (active === undefined) {
        return res.status(400).json({ error: 'Missing active parameter' });
    }
    
    techDifficulties[matchId] = Boolean(active);
    matchTimestamps[matchId] = Date.now();
    res.json({ success: true, matchId, active: techDifficulties[matchId] });
});

// API endpoint: Get tech difficulties overlay status
app.get('/api/tech-difficulties/:matchId', (req, res) => {
    const { matchId } = req.params;
    const active = techDifficulties[matchId] || false;
    res.json({ active });
});

// ========== MANUAL VETO DATA ENDPOINTS ==========
// API endpoint: Set manual veto data (protected)
app.post('/api/manual-veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { vetoData } = req.body;
    
    if (!vetoData || !Array.isArray(vetoData)) {
        return res.status(400).json({ 
            success: false,
            error: 'Missing or invalid vetoData parameter. Expected array of veto items.' 
        });
    }
    
    // Validate veto data structure
    for (const item of vetoData) {
        if (!item.map || !item.type || !item.team) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid veto item structure. Each item needs: map, type (ban/pick/decider), team (team1/team2)' 
            });
        }
    }
    
    manualVetoData.set(matchId, {
        vetoData: vetoData,
        timestamp: Date.now()
    });
    
    console.log(`[Manual Veto] Set for match ${matchId}:`, vetoData);
    
    res.json({ 
        success: true, 
        matchId, 
        vetoData: vetoData 
    });
});

// API endpoint: Get manual veto data
app.get('/api/manual-veto/:matchId', (req, res) => {
    const { matchId } = req.params;
    const data = manualVetoData.get(matchId);
    
    if (!data) {
        return res.json({ 
            hasManualVeto: false 
        });
    }
    
    res.json({
        hasManualVeto: true,
        vetoData: data.vetoData,
        timestamp: data.timestamp
    });
});

// API endpoint: Delete manual veto data (protected)
app.delete('/api/manual-veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const existed = manualVetoData.has(matchId);
    
    manualVetoData.delete(matchId);
    
    console.log(`[Manual Veto] Cleared for match ${matchId}`);
    
    res.json({ 
        success: true, 
        matchId,
        wasActive: existed
    });
});

// ========== END MANUAL VETO DATA ENDPOINTS ==========

// Admin interface (protected)
app.get('/admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Outro page for match end (score and thank you message)
app.get('/outro/:matchId', (req, res) => {
    const { matchId } = req.params;
    
    // Check if it's a match ID (FACEIT format: 1-GUID)
    if (matchId.match(/^1-[a-f0-9-]+$/i)) {
        res.sendFile(path.join(__dirname, 'public', 'outro.html'));
    } else {
        res.status(404).send('Invalid Match ID');
    }
});

// Route for viewer pages (Match ID as URL parameter)
app.get('/:matchId', (req, res) => {
    const { matchId } = req.params;
    
    // Check if it's a match ID (FACEIT format: 1-GUID)
    if (matchId.match(/^1-[a-f0-9-]+$/i)) {
        res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
    } else {
        res.status(404).send('Invalid Match ID');
    }
});

// Fallback to homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Startup function with video compression
async function startServer() {
    console.log('[Server] Starting...');
    
    // Start HTTP server immediately
    app.listen(PORT, () => {
        console.log(`[Server] Running on http://localhost:${PORT}`);
        console.log(`[Server] Admin Interface: http://localhost:${PORT}/admin`);
        console.log(`[Server] Viewer Example: http://localhost:${PORT}/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`);
        
        // Log video status
        const videoCount = getVideoFiles().length;
        const videoSource = useProcessedVideos ? 'compressed (processed/)' : 'original (videos/)';
        console.log(`[Server] Serving ${videoCount} ${videoSource} video(s)`);
    });
    
    // Compress videos in background (only new/changed videos)
    // This runs asynchronously after server start to avoid blocking
    console.log('[Server] Starting background video compression...');
    compressAllVideos()
        .then(() => {
            console.log('[Server] Background video compression completed');
            // Update video source after compression completes
            const videoCount = getVideoFiles().length;
            const videoSource = useProcessedVideos ? 'compressed (processed/)' : 'original (videos/)';
            console.log(`[Server] Now serving ${videoCount} ${videoSource} video(s)`);
        })
        .catch(error => {
            console.error('[Server] Background video compression failed:', error.message);
            console.log('[Server] Continuing with original videos...');
        });
}

// Start the server
startServer().catch(error => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
});
