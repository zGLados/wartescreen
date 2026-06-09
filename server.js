const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { compressAllVideos } = require('./scripts/compress-videos');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Configuration (CS Demo Manager)
const USE_POSTGRES_STATS = process.env.USE_POSTGRES_STATS === 'true';
let pgPool = null;

if (USE_POSTGRES_STATS) {
    try {
        pgPool = new Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT) || 5432,
            database: process.env.POSTGRES_DATABASE || 'csdm',
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        
        // Test connection
        pgPool.query('SELECT NOW()', (err) => {
            if (err) {
                console.error('[PostgreSQL] Connection failed:', err.message);
                console.error('[PostgreSQL] Falling back to FACEIT API');
                pgPool = null;
            } else {
                console.log('[PostgreSQL] Connected to CS Demo Manager database');
            }
        });
    } catch (error) {
        console.error('[PostgreSQL] Setup failed:', error.message);
        console.error('[PostgreSQL] Falling back to FACEIT API');
        pgPool = null;
    }
} else {
    console.log('[PostgreSQL] Disabled - using FACEIT API for stats');
}

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
    { id: 'Aindrew', name: 'Aindrew', steamId: '76561198027564721' },
    { id: 'Fucs2i', name: 'Fucsii', steamId: '76561198018570338' },
    { id: 'cLn395', name: 'cLn', steamId: '76561198047827159' },
    { id: 'Bravo1911', name: 'Bravo', steamId: '76561198128596677' },
    { id: 'Henzzik', name: 'Henzzik', steamId: '76561198849971068' }
];

// Roster Configuration (editable from admin interface)
let rosterConfig = [
    { id: 'Aindrew', name: 'Aindrew', role: 'Rifler', image: 'aindrew.png', active: true },
    { id: 'cLn395', name: 'cLn', role: 'AWPer', image: 'cln.png', active: true },
    { id: 'Bravo1911', name: 'Bravo', role: 'IGL', image: 'bravo.png', active: true },
    { id: 'Fucs2i', name: 'Fucsii', role: 'Rifler', image: 'fucsii.png', active: true },
    { id: 'Henzzik', name: 'Henzzik', role: 'Lurk', image: 'henzzik.png', active: true },
    { id: 'Standin', name: 'Stand-in', role: 'Player', image: 'standin.png', active: false }
];

// ========== POSTGRESQL STATS FUNCTIONS ==========

/**
 * Get player statistics from CS Demo Manager PostgreSQL database
 * @param {string} steamId - Steam ID of the player (e.g., '76561198064695692')
 * @returns {Promise<Object|null>} Player statistics or null
 */
async function getPlayerStatsFromPostgres(steamId) {
    if (!pgPool) {
        console.warn('[PostgreSQL] Pool not available, cannot fetch stats');
        return null;
    }
    
    try {
        // Season dates from environment variables
        // SEASON_START: When the regular season began (e.g., '2026-04-06' for S57)
        // PLAYOFF_START: When playoffs began (e.g., '2026-05-26' for S57)
        const SEASON_START_DATE = process.env.SEASON_START_DATE || '2026-04-06';
        const PLAYOFF_START_DATE = process.env.PLAYOFF_START_DATE || '2026-05-26';
        
        // Query to get comprehensive player statistics split by Regular Season / Playoffs
        const query = `
            SELECT 
                p.steam_id,
                p.name as player_name,
                
                -- Regular Season Stats (before 2026-05-26)
                COUNT(DISTINCT CASE WHEN DATE(d.date) < DATE($2) THEN p.match_checksum END) as match_count_regular,
                AVG(CASE WHEN DATE(d.date) < DATE($2) THEN p.hltv_rating_2 END) as avg_rating2_regular,
                AVG(CASE WHEN DATE(d.date) < DATE($2) THEN p.average_damage_per_round END) as avg_adr_regular,
                AVG(CASE WHEN DATE(d.date) < DATE($2) THEN p.headshot_percentage END) as avg_headshot_pct_regular,
                CASE 
                    WHEN SUM(CASE WHEN DATE(d.date) < DATE($2) THEN p.death_count ELSE 0 END) > 0 
                    THEN SUM(CASE WHEN DATE(d.date) < DATE($2) THEN p.kill_count ELSE 0 END)::NUMERIC / 
                         SUM(CASE WHEN DATE(d.date) < DATE($2) THEN p.death_count ELSE 0 END)
                    ELSE SUM(CASE WHEN DATE(d.date) < DATE($2) THEN p.kill_count ELSE 0 END)::NUMERIC
                END as overall_kd_regular,
                
                -- Playoff Stats (from 2026-05-26 onwards)
                COUNT(DISTINCT CASE WHEN DATE(d.date) >= DATE($2) THEN p.match_checksum END) as match_count_playoffs,
                AVG(CASE WHEN DATE(d.date) >= DATE($2) THEN p.hltv_rating_2 END) as avg_rating2_playoffs,
                AVG(CASE WHEN DATE(d.date) >= DATE($2) THEN p.average_damage_per_round END) as avg_adr_playoffs,
                AVG(CASE WHEN DATE(d.date) >= DATE($2) THEN p.headshot_percentage END) as avg_headshot_pct_playoffs,
                CASE 
                    WHEN SUM(CASE WHEN DATE(d.date) >= DATE($2) THEN p.death_count ELSE 0 END) > 0 
                    THEN SUM(CASE WHEN DATE(d.date) >= DATE($2) THEN p.kill_count ELSE 0 END)::NUMERIC / 
                         SUM(CASE WHEN DATE(d.date) >= DATE($2) THEN p.death_count ELSE 0 END)
                    ELSE SUM(CASE WHEN DATE(d.date) >= DATE($2) THEN p.kill_count ELSE 0 END)::NUMERIC
                END as overall_kd_playoffs,
                
                -- Overall stats (for backwards compatibility)
                COUNT(DISTINCT p.match_checksum) as match_count,
                SUM(p.kill_count) as total_kills,
                SUM(p.death_count) as total_deaths,
                SUM(p.assist_count) as total_assists,
                SUM(p.mvp_count) as total_mvps,
                SUM(p.headshot_count) as total_headshots,
                AVG(p.headshot_percentage) as avg_headshot_pct,
                AVG(p.hltv_rating_2) as avg_rating2,
                AVG(p.average_damage_per_round) as avg_adr,
                AVG(p.kill_death_ratio) as avg_kd,
                SUM(p.five_kill_count) as total_aces,
                SUM(p.four_kill_count) as total_4k,
                SUM(p.three_kill_count) as total_3k,
                SUM(p.bomb_planted_count) as total_bomb_plants,
                SUM(p.bomb_defused_count) as total_bomb_defuses,
                AVG(p.kast) as avg_kast,
                SUM(p.first_kill_count) as total_first_kills,
                SUM(p.first_death_count) as total_first_deaths,
                CASE 
                    WHEN SUM(p.death_count) > 0 
                    THEN SUM(p.kill_count)::NUMERIC / SUM(p.death_count)
                    ELSE SUM(p.kill_count)::NUMERIC
                END as overall_kd,
                CASE 
                    WHEN COUNT(DISTINCT p.match_checksum) > 0 
                    THEN SUM(p.kill_count)::NUMERIC / COUNT(DISTINCT p.match_checksum)
                    ELSE 0
                END as avg_kills_per_match
            FROM players p
            JOIN matches m ON p.match_checksum = m.checksum
            JOIN demos d ON p.match_checksum = d.checksum
            WHERE p.steam_id = $1
            GROUP BY p.steam_id, p.name
        `;
        
        const result = await pgPool.query(query, [steamId, PLAYOFF_START_DATE]);
        
        if (result.rows.length === 0) {
            console.warn(`[PostgreSQL] No stats found for Steam ID: ${steamId}`);
            return null;
        }
        
        const stats = result.rows[0];
        
        // Format the data with Regular Season / Playoffs split
        return {
            steamId: stats.steam_id,
            playerName: stats.player_name,
            
            // Regular Season Stats
            regular: {
                matchCount: parseInt(stats.match_count_regular) || 0,
                avgRating2: parseFloat(stats.avg_rating2_regular) || 0,
                avgAdr: parseFloat(stats.avg_adr_regular) || 0,
                avgHeadshotPct: parseFloat(stats.avg_headshot_pct_regular) || 0,
                overallKd: parseFloat(stats.overall_kd_regular) || 0
            },
            
            // Playoff Stats
            playoffs: {
                matchCount: parseInt(stats.match_count_playoffs) || 0,
                avgRating2: parseFloat(stats.avg_rating2_playoffs) || 0,
                avgAdr: parseFloat(stats.avg_adr_playoffs) || 0,
                avgHeadshotPct: parseFloat(stats.avg_headshot_pct_playoffs) || 0,
                overallKd: parseFloat(stats.overall_kd_playoffs) || 0
            },
            
            // Overall stats (backwards compatibility)
            matchCount: parseInt(stats.match_count) || 0,
            totalKills: parseInt(stats.total_kills) || 0,
            totalDeaths: parseInt(stats.total_deaths) || 0,
            totalAssists: parseInt(stats.total_assists) || 0,
            mvps: parseInt(stats.total_mvps) || 0,
            totalHeadshots: parseInt(stats.total_headshots) || 0,
            avgHeadshotPct: parseFloat(stats.avg_headshot_pct) || 0,
            avgRating2: parseFloat(stats.avg_rating2) || 0,
            avgAdr: parseFloat(stats.avg_adr) || 0,
            avgKd: parseFloat(stats.avg_kd) || 0,
            overallKd: parseFloat(stats.overall_kd) || 0,
            avgKillsPerMatch: parseFloat(stats.avg_kills_per_match).toFixed(1),
            totalAces: parseInt(stats.total_aces) || 0,
            total4k: parseInt(stats.total_4k) || 0,
            total3k: parseInt(stats.total_3k) || 0,
            totalBombPlants: parseInt(stats.total_bomb_plants) || 0,
            totalBombDefuses: parseInt(stats.total_bomb_defuses) || 0,
            avgKast: parseFloat(stats.avg_kast) || 0,
            totalFirstKills: parseInt(stats.total_first_kills) || 0,
            totalFirstDeaths: parseInt(stats.total_first_deaths) || 0,
            source: 'postgres',
            cachedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('[PostgreSQL] Error fetching player stats:', error.message);
        return null;
    }
}

/**
 * Get team statistics from CS Demo Manager database
 * Calculates team winrate based on recent matches
 */
async function getTeamStatsFromPostgres(steamIds, limit = 100) {
    if (!pgPool || steamIds.length === 0) {
        return null;
    }
    
    try {
        // Season dates from environment variables
        const SEASON_START_DATE = process.env.SEASON_START_DATE || '2026-04-06';
        const PLAYOFF_START_DATE = process.env.PLAYOFF_START_DATE || '2026-05-26';
        
        // Query to get team match results (using demos.date for match date)
        const query = `
            SELECT 
                m.checksum,
                m.winner_name,
                d.date as match_date,
                p.team_name,
                COUNT(DISTINCT p.steam_id) as our_players
            FROM matches m
            JOIN demos d ON m.checksum = d.checksum
            JOIN players p ON p.match_checksum = m.checksum
            WHERE p.steam_id = ANY($1)
            GROUP BY m.checksum, m.winner_name, d.date, p.team_name
            HAVING COUNT(DISTINCT p.steam_id) >= 3
            ORDER BY d.date DESC
            LIMIT $2
        `;
        
        const result = await pgPool.query(query, [steamIds, limit]);
        
        if (result.rows.length === 0) {
            return { 
                regular: { winrate: 0, wins: 0, losses: 0, totalMatches: 0 },
                playoffs: { winrate: 0, wins: 0, losses: 0, totalMatches: 0 },
                winrate: 0, wins: 0, losses: 0, totalMatches: 0 
            };
        }
        
        // Calculate wins/losses for Regular Season and Playoffs
        let winsRegular = 0, lossesRegular = 0;
        let winsPlayoffs = 0, lossesPlayoffs = 0;
        let wins = 0, losses = 0;
        
        for (const match of result.rows) {
            const isWin = match.winner_name === match.team_name;
            const matchDate = new Date(match.match_date).toISOString().split('T')[0];
            const isPlayoff = matchDate >= PLAYOFF_START_DATE;
            
            if (isWin) {
                wins++;
                if (isPlayoff) winsPlayoffs++;
                else winsRegular++;
            } else {
                losses++;
                if (isPlayoff) lossesPlayoffs++;
                else lossesRegular++;
            }
        }
        
        const totalMatches = wins + losses;
        const winrate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
        
        const totalMatchesRegular = winsRegular + lossesRegular;
        const winrateRegular = totalMatchesRegular > 0 ? Math.round((winsRegular / totalMatchesRegular) * 100) : 0;
        
        const totalMatchesPlayoffs = winsPlayoffs + lossesPlayoffs;
        const winratePlayoffs = totalMatchesPlayoffs > 0 ? Math.round((winsPlayoffs / totalMatchesPlayoffs) * 100) : 0;
        
        return {
            regular: {
                winrate: winrateRegular,
                wins: winsRegular,
                losses: lossesRegular,
                totalMatches: totalMatchesRegular
            },
            playoffs: {
                winrate: winratePlayoffs,
                wins: winsPlayoffs,
                losses: lossesPlayoffs,
                totalMatches: totalMatchesPlayoffs
            },
            // Overall (backwards compatibility)
            winrate,
            wins,
            losses,
            totalMatches
        };
    } catch (error) {
        console.error('[PostgreSQL] Error fetching team stats:', error.message);
        return null;
    }
}

// ========== END POSTGRESQL STATS FUNCTIONS ==========

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

/**
 * Calculate player statistics from PostgreSQL database
 * @param {string} playerId - Player ID (e.g., 'Aindrew')
 * @returns {Promise<Object|null>} Player statistics or null if not found
 */
async function calculatePlayerStats(playerId) {
    // Find player with Steam ID
    const playerConfig = TRACKED_PLAYERS.find(p => p.id === playerId);
    
    if (!playerConfig) {
        console.error(`[Stats] Player not found in TRACKED_PLAYERS: ${playerId}`);
        return null;
    }
    
    if (!playerConfig.steamId || playerConfig.steamId === 'STEAM_ID_HERE') {
        console.error(`[Stats] Steam ID not configured for player: ${playerId}`);
        console.error(`[Stats] Please add the Steam ID in server.js TRACKED_PLAYERS array`);
        return null;
    }
    
    if (!pgPool) {
        console.error(`[Stats] PostgreSQL connection not available`);
        return null;
    }
    
    // Get player stats from PostgreSQL
    const pgStats = await getPlayerStatsFromPostgres(playerConfig.steamId);
    
    if (!pgStats) {
        console.error(`[Stats] No PostgreSQL stats found for ${playerId}`);
        return null;
    }
    
    // Get team stats (winrate) from PostgreSQL
    const allSteamIds = TRACKED_PLAYERS
        .filter(p => p.steamId && p.steamId !== 'STEAM_ID_HERE')
        .map(p => p.steamId);
    
    const teamStats = await getTeamStatsFromPostgres(allSteamIds);
    
    // Combine player and team stats with Regular Season / Playoffs split
    return {
        player: {
            player_id: playerId,
            nickname: playerConfig.name,
            avatar: '', // Not available in PostgreSQL
        },
        // Regular Season / Playoffs Split
        regular: {
            matchCount: pgStats.regular.matchCount,
            avgRating2: parseFloat(pgStats.regular.avgRating2.toFixed(2)),
            avgAdr: parseFloat(pgStats.regular.avgAdr.toFixed(1)),
            avgHeadshotPct: parseFloat(pgStats.regular.avgHeadshotPct.toFixed(1)),
            overallKd: parseFloat(pgStats.regular.overallKd.toFixed(2)),
            winrate: teamStats && teamStats.regular ? teamStats.regular.winrate : 0,
            teamWins: teamStats && teamStats.regular ? teamStats.regular.wins : 0,
            teamMatchesCount: teamStats && teamStats.regular ? teamStats.regular.totalMatches : 0
        },
        playoffs: {
            matchCount: pgStats.playoffs.matchCount,
            avgRating2: parseFloat(pgStats.playoffs.avgRating2.toFixed(2)),
            avgAdr: parseFloat(pgStats.playoffs.avgAdr.toFixed(1)),
            avgHeadshotPct: parseFloat(pgStats.playoffs.avgHeadshotPct.toFixed(1)),
            overallKd: parseFloat(pgStats.playoffs.overallKd.toFixed(2)),
            winrate: teamStats && teamStats.playoffs ? teamStats.playoffs.winrate : 0,
            teamWins: teamStats && teamStats.playoffs ? teamStats.playoffs.wins : 0,
            teamMatchesCount: teamStats && teamStats.playoffs ? teamStats.playoffs.totalMatches : 0
        },
        // Overall stats (backwards compatibility)
        mvps: pgStats.mvps,
        avgKills: pgStats.avgKillsPerMatch,
        winrate: teamStats ? teamStats.winrate : 0,
        kd: pgStats.overallKd.toFixed(2),
        validMatches: pgStats.matchCount,
        teamMatchesCount: teamStats ? teamStats.totalMatches : 0,
        teamWins: teamStats ? teamStats.wins : 0,
        // Additional PostgreSQL-only stats
        totalAces: pgStats.totalAces,
        total4k: pgStats.total4k,
        total3k: pgStats.total3k,
        avgRating2: pgStats.avgRating2.toFixed(2),
        avgAdr: pgStats.avgAdr.toFixed(1),
        avgHeadshotPct: pgStats.avgHeadshotPct.toFixed(1),
        totalBombPlants: pgStats.totalBombPlants,
        totalBombDefuses: pgStats.totalBombDefuses,
        avgKast: pgStats.avgKast.toFixed(1),
        source: 'postgres',
        cachedAt: pgStats.cachedAt
    };
}

// ========== END PLAYER STATS CALCULATION ==========

// Update stats cache for a specific player
async function updatePlayerStatsCache(playerId) {
    try {
        const stats = await calculatePlayerStats(playerId);
        if (stats) {
            playerStatsCache.set(playerId, {
                data: stats,
                timestamp: Date.now()
            });
            return stats;
        }
    } catch (error) {
        console.error(`[Stats Cache] Failed to update cache for ${playerId}:`, error);
    }
    return null;
}

// Update all player stats caches
async function updateAllPlayerStatsCache() {
    for (const player of TRACKED_PLAYERS) {
        await updatePlayerStatsCache(player.id);
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Get cached stats or fetch if not available/expired
async function getCachedPlayerStats(playerId) {
    const cached = playerStatsCache.get(playerId);
    
    // Check if cache is valid
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }
    
    // Cache miss or expired - fetch new data
    return await updatePlayerStatsCache(playerId);
}

// Schedule automatic cache updates every 24 hours
setInterval(updateAllPlayerStatsCache, CACHE_DURATION);

// Initial cache population on server start (async, don't wait)
setTimeout(() => {
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
        return res.status(401).json({ 
            success: false,
            error: 'Authentication required' 
        });
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
        res.status(401).json({ 
            success: false,
            error: 'Invalid credentials' 
        });
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
        return res.json(cached.data);
    }
    
    // Filter for league matches only
    const LEAGUE_FILTER = ['s57', 'open10', 'esea', 'regular season', 'playoffs', 'kleverr'];
    
    try {
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
        
        // Fetch more matches to ensure we get enough league matches after filtering and grouping
        // If we want 5 series and each BO3 has 3 maps, we need at least 15 matches + buffer for non-league matches
        const fetchLimit = Math.max(50, limit * 10); // Fetch at least 50 matches to ensure we have enough data
        const historyResponse = await fetch(`https://open.faceit.com/data/v4/players/${actualPlayerId}/history?game=cs2&limit=${fetchLimit}`, { headers });
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
            // Don't break early - collect more matches to ensure we can group BO3s properly
            // We'll limit after grouping
            
            // Filter: Only include league matches
            const compName = (match.competition_name || '').toLowerCase();
            const isLeagueMatch = LEAGUE_FILTER.some(keyword => compName.includes(keyword));
            
            // Skip non-league matches (like "Europe 5v5 Queue")
            if (!isLeagueMatch) {
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
                
                // Also fetch match details to get best_of and series score
                const matchDetailsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${match.match_id}`, { headers });
                const matchDetails = matchDetailsResponse.ok ? await matchDetailsResponse.json() : null;
                const bestOf = matchDetails?.best_of || 1;
                
                // Get series score from match details (for BO3/BO5)
                let seriesScore = null;
                let pickedMaps = [];
                let detailedMapResults = [];
                if (matchDetails && matchDetails.results && matchDetails.results.score && bestOf > 1) {
                    seriesScore = matchDetails.results.score;
                    
                    // Get picked maps from voting
                    if (matchDetails.voting && matchDetails.voting.map && matchDetails.voting.map.pick) {
                        pickedMaps = matchDetails.voting.map.pick.map(mapId => {
                            const mapName = mapId.replace('de_', '').toUpperCase();
                            return mapName;
                        });
                    }
                    
                    // Get detailed results for each map (scores)
                    if (matchDetails.detailed_results && Array.isArray(matchDetails.detailed_results)) {
                        detailedMapResults = matchDetails.detailed_results;
                    }
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
                
                // Determine which faction our team is for series score
                let ourSeriesScore = null;
                let enemySeriesScore = null;
                if (seriesScore && matchDetails) {
                    // Find our faction by matching team names
                    const faction1Name = matchDetails.teams?.faction1?.name;
                    const faction2Name = matchDetails.teams?.faction2?.name;
                    const ourTeamName = ourTeam.team_stats.Team;
                    
                    if (faction1Name === ourTeamName || ourTeamName.includes(faction1Name) || faction1Name.includes(ourTeamName)) {
                        ourSeriesScore = seriesScore.faction1;
                        enemySeriesScore = seriesScore.faction2;
                    } else if (faction2Name === ourTeamName || ourTeamName.includes(faction2Name) || faction2Name.includes(ourTeamName)) {
                        ourSeriesScore = seriesScore.faction2;
                        enemySeriesScore = seriesScore.faction1;
                    }
                }
                
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
                    bestOf: bestOf,
                    seriesScore: ourSeriesScore !== null ? { our: ourSeriesScore, enemy: enemySeriesScore } : null,
                    pickedMaps: pickedMaps.length > 0 ? pickedMaps : null,
                    detailedMapResults: detailedMapResults.length > 0 ? detailedMapResults : null,
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
        
        // Group BO3 matches (matches against same opponent on same day)
        const groupedMatches = [];
        const processedMatchIds = new Set();
        
        for (let i = 0; i < matches.length; i++) {
            if (processedMatchIds.has(matches[i].match_id)) continue;
            
            const currentMatch = matches[i];
            const matchDate = new Date(currentMatch.started_at * 1000).toDateString();
            
            // Find other matches against same opponent on same day
            const relatedMatches = [currentMatch];
            processedMatchIds.add(currentMatch.match_id);
            
            for (let j = i + 1; j < matches.length; j++) {
                const otherMatch = matches[j];
                const otherDate = new Date(otherMatch.started_at * 1000).toDateString();
                
                if (otherMatch.enemyTeam === currentMatch.enemyTeam && 
                    otherDate === matchDate &&
                    !processedMatchIds.has(otherMatch.match_id)) {
                    relatedMatches.push(otherMatch);
                    processedMatchIds.add(otherMatch.match_id);
                }
            }
            
            // If multiple matches found, create a BO3/BO5 entry
            if (relatedMatches.length > 1) {
                // Calculate series score (wins)
                const ourWins = relatedMatches.filter(m => m.isWin).length;
                const enemyWins = relatedMatches.length - ourWins;
                const actualBestOf = relatedMatches[0].bestOf || relatedMatches.length;
                
                groupedMatches.push({
                    match_id: currentMatch.match_id,
                    competition_name: currentMatch.competition_name,
                    started_at: currentMatch.started_at,
                    finished_at: currentMatch.finished_at,
                    ourTeam: currentMatch.ourTeam,
                    enemyTeam: currentMatch.enemyTeam,
                    ourScore: ourWins,
                    enemyScore: enemyWins,
                    isWin: ourWins > enemyWins,
                    isSeries: true,
                    bestOf: actualBestOf,
                    maps: relatedMatches.map(m => ({
                        map: m.map,
                        ourScore: m.ourScore,
                        enemyScore: m.enemyScore,
                        isWin: m.isWin,
                        firstHalf: m.firstHalf,
                        secondHalf: m.secondHalf
                    }))
                });
            } else if (currentMatch.bestOf > 1) {
                // Single match but it's part of a BO3/BO5 (other maps not played or not in history)
                // Use series score from FACEIT if available
                const ourScore = currentMatch.seriesScore ? currentMatch.seriesScore.our : (currentMatch.isWin ? 1 : 0);
                const enemyScore = currentMatch.seriesScore ? currentMatch.seriesScore.enemy : (currentMatch.isWin ? 0 : 1);
                
                // Build maps array - try to use detailed results if available
                const mapsArray = [];
                
                if (currentMatch.pickedMaps && currentMatch.detailedMapResults && currentMatch.detailedMapResults.length > 1) {
                    // We have detailed results for multiple maps
                    // Determine which faction is "our team" based on the first map we know
                    const ourTeamIsFaction1 = currentMatch.isWin === (currentMatch.detailedMapResults[0].winner === 'faction1');
                    
                    // Fetch stats again to get all rounds with half scores
                    let allRounds = null;
                    try {
                        const statsResponse = await fetch(`https://open.faceit.com/data/v4/matches/${currentMatch.match_id}/stats`, { headers });
                        if (statsResponse.ok) {
                            const statsData = await statsResponse.json();
                            allRounds = statsData.rounds || [];
                        }
                    } catch (err) {
                        console.warn(`[API] Could not fetch rounds for half scores: ${err.message}`);
                    }
                    
                    // Create map entries for each detailed result
                    currentMatch.detailedMapResults.forEach((mapResult, idx) => {
                        const mapName = currentMatch.pickedMaps[idx];
                        const ourMapScore = ourTeamIsFaction1 ? mapResult.factions.faction1.score : mapResult.factions.faction2.score;
                        const enemyMapScore = ourTeamIsFaction1 ? mapResult.factions.faction2.score : mapResult.factions.faction1.score;
                        const mapIsWin = (ourTeamIsFaction1 && mapResult.winner === 'faction1') || (!ourTeamIsFaction1 && mapResult.winner === 'faction2');
                        
                        // Try to find half scores from stats rounds
                        let firstHalf = { our: 0, enemy: 0 };
                        let secondHalf = { our: 0, enemy: 0 };
                        
                        if (allRounds && allRounds[idx]) {
                            const round = allRounds[idx];
                            const teams = round.teams;
                            if (teams && teams.length >= 2) {
                                // Find our team by matching team name
                                let ourTeam = teams.find(t => t.team_stats?.Team === currentMatch.ourTeam);
                                let enemyTeam = teams.find(t => t.team_stats?.Team === currentMatch.enemyTeam);
                                
                                // If not found by name, use faction matching
                                if (!ourTeam || !enemyTeam) {
                                    ourTeam = ourTeamIsFaction1 ? teams[0] : teams[1];
                                    enemyTeam = ourTeamIsFaction1 ? teams[1] : teams[0];
                                }
                                
                                if (ourTeam && enemyTeam) {
                                    firstHalf.our = parseInt(ourTeam.team_stats?.['First Half Score'] || 0);
                                    secondHalf.our = parseInt(ourTeam.team_stats?.['Second Half Score'] || 0);
                                    firstHalf.enemy = parseInt(enemyTeam.team_stats?.['First Half Score'] || 0);
                                    secondHalf.enemy = parseInt(enemyTeam.team_stats?.['Second Half Score'] || 0);
                                }
                            }
                        }
                        
                        mapsArray.push({
                            map: mapName,
                            ourScore: ourMapScore,
                            enemyScore: enemyMapScore,
                            isWin: mapIsWin,
                            firstHalf: firstHalf,
                            secondHalf: secondHalf
                        });
                    });
                } else {
                    // Fallback: only have one map in history
                    mapsArray.push({
                        map: currentMatch.map,
                        ourScore: currentMatch.ourScore,
                        enemyScore: currentMatch.enemyScore,
                        isWin: currentMatch.isWin,
                        firstHalf: currentMatch.firstHalf,
                        secondHalf: currentMatch.secondHalf
                    });
                }
                
                groupedMatches.push({
                    match_id: currentMatch.match_id,
                    competition_name: currentMatch.competition_name,
                    started_at: currentMatch.started_at,
                    finished_at: currentMatch.finished_at,
                    ourTeam: currentMatch.ourTeam,
                    enemyTeam: currentMatch.enemyTeam,
                    ourScore: ourScore,
                    enemyScore: enemyScore,
                    isWin: currentMatch.isWin,
                    isSeries: true,
                    bestOf: currentMatch.bestOf,
                    hasFullSeriesScore: !!currentMatch.seriesScore,
                    pickedMaps: currentMatch.pickedMaps || null,
                    maps: mapsArray
                });
            } else {
                // Single match (BO1)
                groupedMatches.push({
                    ...currentMatch,
                    isSeries: false,
                    bestOf: 1
                });
            }
        }
        
        // Take only the requested limit after grouping
        const finalMatches = groupedMatches.slice(0, limit);
        
        const response = {
            success: true,
            matches: finalMatches,
            count: finalMatches.length
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
    const teamId = req.query.teamId; // Optional team filter
    
    // Check cache first
    const cacheKey = `upcoming_${championshipId}${teamId ? `_${teamId}` : ''}`;
    const cached = pastMatchesCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return res.json(cached.data);
    }
    
    try {
        const headers = {
            'Authorization': `Bearer ${FACEIT_API_KEY}`,
            'Accept': 'application/json'
        };
        
        // Fetch more matches if filtering by team to ensure we get enough results
        const fetchLimit = teamId ? limit * 10 : limit * 2;
        
        // Fetch upcoming matches from championship
        const matchesResponse = await fetch(
            `https://open.faceit.com/data/v4/championships/${championshipId}/matches?type=upcoming&offset=0&limit=${fetchLimit}`,
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
                if (!match.teams || !match.teams.faction1 || !match.teams.faction2) {
                    return false;
                }
                
                // If teamId is specified, filter for that team
                if (teamId) {
                    const faction1Id = match.teams.faction1.faction_id;
                    const faction2Id = match.teams.faction2.faction_id;
                    return faction1Id === teamId || faction2Id === teamId;
                }
                
                return true;
            })
            .slice(0, limit)
            .map(match => ({
                match_id: match.match_id,
                competition_name: match.competition_name,
                scheduled_at: match.scheduled_at,
                status: match.status,
                best_of: match.best_of || 1,
                teams: {
                    faction1: {
                        name: match.teams.faction1.name || match.teams.faction1.nickname || 'Team 1',
                        faction_id: match.teams.faction1.faction_id,
                        avatar: match.teams.faction1.avatar || null
                    },
                    faction2: {
                        name: match.teams.faction2.name || match.teams.faction2.nickname || 'Team 2',
                        faction_id: match.teams.faction2.faction_id,
                        avatar: match.teams.faction2.avatar || null
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
    const { vetoData, team1Name, team2Name, bestOf } = req.body;
    
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
        team1Name: team1Name || '',
        team2Name: team2Name || '',
        bestOf: bestOf || 1,
        timestamp: Date.now()
    });
    
    console.log(`[Manual Veto] Set for match ${matchId}:`, { team1Name, team2Name, bestOf, vetoCount: vetoData.length });
    
    res.json({ 
        success: true, 
        matchId, 
        vetoData: vetoData,
        team1Name,
        team2Name,
        bestOf
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
        team1Name: data.team1Name,
        team2Name: data.team2Name,
        bestOf: data.bestOf,
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

// ========== ROSTER MANAGEMENT API ==========

// API: Get roster configuration
app.get('/api/roster/config', (req, res) => {
    res.json({
        success: true,
        roster: rosterConfig
    });
});

// API: Update roster configuration
app.post('/api/roster/config', requireAuth, (req, res) => {
    const { roster } = req.body;
    
    if (!roster || !Array.isArray(roster)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid roster data'
        });
    }
    
    // Validate roster data
    for (const player of roster) {
        if (!player.id || !player.name || !player.role || !player.image || typeof player.active !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Invalid player data structure'
            });
        }
    }
    
    rosterConfig = roster;
    
    res.json({
        success: true,
        roster: rosterConfig
    });
});

// ========== END ROSTER MANAGEMENT API ==========

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
    
    // Add error handler for unhandled errors
    process.on('uncaughtException', (error) => {
        console.error('[Server] Uncaught Exception:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Start HTTP server immediately
    const server = app.listen(PORT, () => {
        console.log(`[Server] Running on http://localhost:${PORT}`);
        console.log(`[Server] Admin Interface: http://localhost:${PORT}/admin`);
        console.log(`[Server] Viewer Example: http://localhost:${PORT}/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`);
        
        // Log video status
        const videoCount = getVideoFiles().length;
        const videoSource = useProcessedVideos ? 'compressed (processed/)' : 'original (videos/)';
        console.log(`[Server] Serving ${videoCount} ${videoSource} video(s)`);
    });
    
    server.on('error', (error) => {
        console.error('[Server] Server error:', error);
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
