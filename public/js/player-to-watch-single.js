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
    currentVideoIndex = (currentVideoIndex + 1) % videoFiles.length;
    const videoFile = videoFiles[currentVideoIndex];
    
    // Clear old source before setting new one
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    // Set new video source
    videoElement.src = `/videos/${videoFile}`;
    
    // Wait for video to be ready before playing
    videoElement.addEventListener('canplay', function onCanPlay() {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.play().catch(err => {
            console.log('Autoplay prevented:', err);
            isLoadingVideo = false;
        });
        isLoadingVideo = false;
    }, { once: true });
    
    // Fallback timeout
    setTimeout(() => {
        isLoadingVideo = false;
    }, 5000);
}

videoElement.addEventListener('ended', playNextVideo);

// Handle errors gracefully
videoElement.addEventListener('error', (e) => {
    console.error('Video error:', e);
    isLoadingVideo = false;
    setTimeout(playNextVideo, 1000); // Try next video after 1 second
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
    playerAvatarEl.src = stats.player.avatar || '/logo_T_default.png';
    playerAvatarEl.alt = playerName;

    stat1.querySelector('.stat-value').textContent = `${stats.mvps}`;
    stat2.querySelector('.stat-value').textContent = stats.avgKills;
    stat3.querySelector('.stat-value').textContent = `${stats.winrate}%`;
    stat4.querySelector('.stat-value').textContent = stats.kd;

    console.log(`Displayed stats for ${playerName}:`, stats);
    
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
    
    // Start video playback
    if (videoFiles.length > 0) {
        await playNextVideo();
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
