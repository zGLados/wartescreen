// Player to Watch - Single Player Configuration
// PLAYER_ID and PLAYER_NAME are set in the HTML file inline script

// Video Management
let currentVideoIndex = 0;
const videoElement = document.getElementById('bg-video-local');
let videoFiles = [];
let isLoadingVideo = false;

// Fetch video list once at startup
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
    if (isLoadingVideo) return; // Prevent multiple simultaneous loads
    
    if (videoFiles.length === 0) {
        console.warn('No videos available');
        return;
    }

    isLoadingVideo = true;
    let loadingTimeout = null;
    let hasStartedPlaying = false;
    
    currentVideoIndex = (currentVideoIndex + 1) % videoFiles.length;
    const videoFile = videoFiles[currentVideoIndex];
    
    // Clear old source before setting new one
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    // Set new video source (URL-encode the filename)
    const videoFileName = encodeURIComponent(videoFile);
    videoElement.src = `/videos/${videoFileName}`;
    videoElement.preload = 'auto';
    
    // Function to start playback
    const startPlayback = () => {
        if (hasStartedPlaying) return;
        hasStartedPlaying = true;
        
        if (loadingTimeout) clearTimeout(loadingTimeout);
        
        videoElement.play().catch(err => {
            console.log('Autoplay prevented:', err);
            isLoadingVideo = false;
        });
        isLoadingVideo = false;
    };
    
    // Listen for when enough data is loaded
    videoElement.addEventListener('canplaythrough', function onCanPlayThrough() {
        videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
        startPlayback();
    }, { once: true });
    
    // Fallback
    setTimeout(() => {
        if (!hasStartedPlaying && videoElement.readyState >= 3) {
            startPlayback();
        }
    }, 3000);
    
    // Extended timeout
    loadingTimeout = setTimeout(() => {
        if (!hasStartedPlaying) {
            console.warn('Video loading timeout, skipping');
            isLoadingVideo = false;
            playNextVideo();
        }
    }, 30000);
}

videoElement.addEventListener('ended', playNextVideo);

// Handle errors gracefully
videoElement.addEventListener('error', (e) => {
    console.error('Video error:', e);
    isLoadingVideo = false;
    setTimeout(playNextVideo, 1000); // Try next video after 1 second
});

// Page Visibility API: Pause videos when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        videoElement.pause();
        console.log('[Video] Page hidden - paused video');
    } else {
        if (!isLoadingVideo && videoElement.paused) {
            videoElement.play().catch(err => {
                console.log('[Video] Resume failed:', err);
            });
            console.log('[Video] Page visible - resumed video');
        }
    }
});

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

// Fetch player stats from server (cached data)
async function fetchPlayerStats(playerId) {
    try {
        const response = await fetch(`/api/player-stats/${playerId}`);
        if (!response.ok) throw new Error(`Failed to fetch stats for ${playerId}`);
        
        const result = await response.json();
        
        if (result.success && result.data) {
            return result.data;
        } else {
            throw new Error(result.error || 'Stats not available');
        }
    } catch (error) {
        console.error('Error fetching player stats:', error);
        return null;
    }
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

    // Fetch stats from server
    const stats = await fetchPlayerStats(playerId);
    
    if (!stats) {
        playerNameEl.textContent = 'ERROR';
        console.error('Failed to load player stats');
        return;
    }

    // Update UI
    playerNameEl.textContent = playerName.toUpperCase();
    
    // Set player image based on playerId (use local playerpic images)
    const playerImageMap = {
        'Aindrew': '/playerpic/aindrew.png',
        'Fucs2i': '/playerpic/fucsii.png',
        'cLn395': '/playerpic/cln.png',
        'Bravo1911': '/playerpic/bravo.png',
        'Henzzik': '/playerpic/henzzik.png'
    };
    
    playerAvatarEl.src = playerImageMap[playerId] || '/logo_T_default.png';
    playerAvatarEl.alt = playerName;

    // Helper function to format stat with Regular Season / Playoffs split
    function formatSplitStat(regular, playoffs, decimals = 2) {
        if (!regular && !playoffs) return '-';
        if (!regular) return `- / ${playoffs.toFixed ? playoffs.toFixed(decimals) : playoffs}`;
        if (!playoffs) return `${regular.toFixed ? regular.toFixed(decimals) : regular} / -`;
        return `${regular.toFixed ? regular.toFixed(decimals) : regular} / ${playoffs.toFixed ? playoffs.toFixed(decimals) : playoffs}`;
    }

    // Display PostgreSQL stats - Split by Regular Season / Playoffs
    // Stat 1: HLTV Rating 2.0 (professional performance metric)
    stat1.querySelector('.stat-value').textContent = formatSplitStat(stats.regular?.avgRating2, stats.playoffs?.avgRating2);
    stat1.querySelector('.stat-label').textContent = 'HLTV Rating 2.0 (Reg / PO)';
    
    // Stat 2: ADR (Average Damage per Round)
    stat2.querySelector('.stat-value').textContent = formatSplitStat(stats.regular?.avgAdr, stats.playoffs?.avgAdr, 1);
    stat2.querySelector('.stat-label').textContent = 'ADR (Reg / PO)';
    
    // Stat 3: Headshot % (aim precision)
    const hsRegular = stats.regular?.avgHeadshotPct ? stats.regular.avgHeadshotPct : null;
    const hsPlayoffs = stats.playoffs?.avgHeadshotPct ? stats.playoffs.avgHeadshotPct : null;
    stat3.querySelector('.stat-value').textContent = formatSplitStat(hsRegular, hsPlayoffs, 1) + (hsRegular || hsPlayoffs ? '%' : '');
    stat3.querySelector('.stat-label').textContent = 'Headshot % (Reg / PO)';
    
    // Stat 4: K/D Ratio
    stat4.querySelector('.stat-value').textContent = formatSplitStat(stats.regular?.overallKd, stats.playoffs?.overallKd);
    stat4.querySelector('.stat-label').textContent = 'K/D Ratio (Reg / PO)';
    
    console.log(`Displayed stats for ${playerName}:`, stats);
    console.log(`Regular Season: ${stats.regular?.matchCount} matches, Playoffs: ${stats.playoffs?.matchCount} matches`);
    
    // Display cache info in console
    if (stats.cachedAt) {
        console.log(`Stats cached at: ${stats.cachedAt}`);
    }
}

// Initialize
async function init() {
    // Load partner logos
    await loadPartnerLogos();
    
    // Load video list once at startup
    videoFiles = await getVideoFiles();
    console.log(`[Video] Loaded ${videoFiles.length} videos`);
    
    // Start video playback (works in OBS and normal browsers)
    if (videoFiles.length > 0) {
        playNextVideo();
        console.log('[Video] Starting video (visibility:', document.hidden ? 'hidden' : 'visible', ')');
        
        // Fallback: If video hasn't started after 5 seconds, force start
        setTimeout(() => {
            if (videoElement.paused && !isLoadingVideo) {
                console.warn('[Video] Fallback: forcing video start');
                playNextVideo();
            }
        }, 5000);
    }
    
    // Display player stats (PLAYER_ID and PLAYER_NAME are set in HTML)
    if (typeof PLAYER_ID !== 'undefined' && typeof PLAYER_NAME !== 'undefined') {
        displayPlayer(PLAYER_ID, PLAYER_NAME);
    } else {
        console.error('PLAYER_ID or PLAYER_NAME not defined!');
    }
}

// Start when page loads
window.addEventListener('DOMContentLoaded', init);
