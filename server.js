const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// FACEIT API Configuration
const FACEIT_API_KEY = process.env.FACEIT_API_KEY || '84e84dc8-0f8a-4497-85ff-5d282933a213';
const LEAGUE_KEYWORDS = ['esea', 'open', 'season', 's57', 'league', 'division', 'championship'];
const TEAM_ID = '905ca82f-1391-4a44-9840-601455a6b75e'; // TacAM Team ID

// Player Stats Cache
const playerStatsCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
    const videosDir = path.join(__dirname, 'videos');
    try {
        if (!fs.existsSync(videosDir)) {
            console.warn('Videos directory not found');
            return [];
        }
        const files = fs.readdirSync(videosDir);
        return files.filter(file => /\.(mp4|webm|ogg|mov)$/i.test(file));
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
    
    // Use player's matches and filter for league matches
    const leagueMatches = matches.filter(match => {
        const compName = (match.competition_name || '').toLowerCase();
        const compType = match.competition_type || '';
        const hasLeagueKeyword = LEAGUE_KEYWORDS.some(keyword => compName.includes(keyword));
        const isChampionship = compType === 'championship';
        return hasLeagueKeyword || isChampionship;
    });
    
    const seasonMatches = leagueMatches;
    console.log(`[Stats] Processing ${seasonMatches.length} league matches for ${playerId}`);

    // Calculate statistics
    let playerTotalKills = 0;
    let playerTotalDeaths = 0;
    let teamTotalKills = 0;
    let teamTotalDeaths = 0;
    let teamWins = 0;
    let teamMatchesCount = 0;
    let playerMvps = 0;
    let playerValidMatches = 0;
    
    for (let i = 0; i < seasonMatches.length; i++) {
        const match = seasonMatches[i];
        
        // Count team wins for team winrate - FIXED: Proper parsing
        if (match.results && match.teams) {
            const teams = match.teams;
            
            // Check if teams object has faction1 and faction2
            if (teams.faction1 && teams.faction2) {
                teamMatchesCount++;
                
                // Determine which faction the player was on
                let playerFaction = null;
                
                // Check faction1
                if (teams.faction1.roster && Array.isArray(teams.faction1.roster)) {
                    if (teams.faction1.roster.some(p => p.player_id === actualPlayerId || p.nickname === playerId)) {
                        playerFaction = 'faction1';
                    }
                }
                
                // Check faction2 if not found in faction1
                if (!playerFaction && teams.faction2.roster && Array.isArray(teams.faction2.roster)) {
                    if (teams.faction2.roster.some(p => p.player_id === actualPlayerId || p.nickname === playerId)) {
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
                if (team.players.some(p => p.player_id === actualPlayerId || p.nickname === playerId)) {
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

    console.log(`[Stats] Stats calculated for ${playerId}: Player matches=${playerValidMatches}, Team matches=${teamMatchesCount}, Wins=${teamWins}, MVPs=${playerMvps}`);

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
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// In-memory storage for timer overrides (can be moved to a DB later)
const timerOverrides = {};

// In-memory storage for veto overrides per match
const vetoOverrides = {};

// In-memory storage for veto start side per match ('left', 'right', or 'auto')
// 'left' = left team starts, 'right' = right team starts, 'auto' = auto-detect from API
const vetoStartOverrides = {};

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
            delete timerOverrides[matchId];
            delete vetoOverrides[matchId];
            delete vetoStartOverrides[matchId];
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
    const showVeto = vetoOverrides[matchId] !== undefined ? vetoOverrides[matchId] : baseShowVeto;
    
    // Default: 'auto' - automatically detect from API which team starts veto
    const vetoStartSide = vetoStartOverrides[matchId] || 'auto';
    
    res.json({
        apiKey: process.env.FACEIT_API_KEY || '',
        videoFiles: getVideoFiles(),
        partnerFiles: getPartnerFiles(),
        showVeto: showVeto,
        vetoStartSide: vetoStartSide,
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
    
    vetoOverrides[matchId] = Boolean(showVeto);
    matchTimestamps[matchId] = Date.now(); // Timestamp for cleanup
    res.json({ success: true, matchId, showVeto: vetoOverrides[matchId] });
});

// API endpoint: Get veto setting
app.get('/api/veto/:matchId', (req, res) => {
    const { matchId } = req.params;
    // Default showVeto to true, unless explicitly set to 'false'
    const baseShowVeto = process.env.SHOW_VETO === 'false' ? false : true;
    const showVeto = vetoOverrides[matchId] !== undefined ? vetoOverrides[matchId] : baseShowVeto;
    
    res.json({
        showVeto: showVeto,
        isOverride: vetoOverrides[matchId] !== undefined
    });
});

// API endpoint: Reset veto setting (protected)
app.delete('/api/veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    delete vetoOverrides[matchId];
    res.json({ success: true });
});

// API endpoint: Set veto start side (protected)
app.post('/api/veto-start/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { side } = req.body;
    
    if (!side || (side !== 'left' && side !== 'right' && side !== 'auto')) {
        return res.status(400).json({ error: 'Invalid side parameter. Must be "left", "right", or "auto"' });
    }
    
    vetoStartOverrides[matchId] = side;
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
    delete vetoStartOverrides[matchId];
    res.json({ success: true });
});

// API endpoint: Set timer override (protected)
app.post('/api/timer/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { duration } = req.body;
    
    if (!duration || isNaN(duration)) {
        return res.status(400).json({ error: 'Invalid duration' });
    }
    
    timerOverrides[matchId] = {
        duration: parseInt(duration),
        timestamp: Date.now()
    };
    matchTimestamps[matchId] = Date.now(); // Timestamp for cleanup
    
    res.json({ success: true, matchId, duration: parseInt(duration) });
});

// API endpoint: Get timer override
app.get('/api/timer/:matchId', (req, res) => {
    const { matchId } = req.params;
    const override = timerOverrides[matchId];
    
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
    delete timerOverrides[matchId];
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

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Admin-Interface: http://localhost:${PORT}/admin`);
    console.log(`Viewer-Beispiel: http://localhost:${PORT}/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`);
});
