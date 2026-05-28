// Configuration
const TEAM_ID = '905ca82f-1391-4a44-9840-601455a6b75e'; // TacAM Team ID
const REFERENCE_PLAYER = 'cLn395'; // Reference player to get match history
const MATCHES_LIMIT = 5; // Number of matches to display

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
    if (isLoadingVideo) return;
    
    if (videoFiles.length === 0) {
        console.warn('No videos available');
        return;
    }

    isLoadingVideo = true;
    currentVideoIndex = (currentVideoIndex + 1) % videoFiles.length;
    const videoFile = videoFiles[currentVideoIndex];
    
    // Clear old source
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load();
    
    // Set new video source with proper URL encoding
    const videoFileName = encodeURIComponent(videoFile);
    videoElement.src = `/videos/${videoFileName}`;
    
    // Wait for video to be ready
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
    setTimeout(playNextVideo, 1000);
});

// Partner Logos
async function loadPartnerLogos() {
    try {
        const response = await fetch('/api/partners');
        if (!response.ok) throw new Error('Failed to fetch partners');
        
        const partners = await response.json();
        const partnerBar = document.getElementById('partnerBar');
        const fallbackLogo = document.getElementById('tacamFallback');
        
        if (partners && partners.length > 0) {
            if (fallbackLogo) fallbackLogo.remove();
            
            partners.forEach(file => {
                const img = document.createElement('img');
                img.src = `/partners/${file}`;
                img.className = 'partner-logo';
                img.alt = 'Partner';
                img.onerror = () => {
                    console.error('Failed to load partner logo:', file);
                    img.style.display = 'none';
                };
                partnerBar.appendChild(img);
            });
        }
    } catch (error) {
        console.error('Error loading partners:', error);
    }
}

// Map name to image file
function getMapImage(mapName) {
    const cleanName = mapName.toLowerCase().replace('de_', '');
    const mapImages = {
        'ancient': 'CS2_de_ancient.png',
        'anubis': 'CS2_de_anubis.png',
        'inferno': 'CS2_de_inferno.png',
        'mirage': 'CS2_de_mirage.png',
        'nuke': 'CS2_de_nuke.png',
        'overpass': 'CS2_de_overpass.png',
        'dust2': 'CS2_Dust_2_A_Site.jpg',
        'dust 2': 'CS2_Dust_2_A_Site.jpg'
    };
    return mapImages[cleanName] || 'CS2_de_mirage.png'; // Fallback to mirage
}

// Fetch Past Matches
async function fetchPastMatches() {
    try {
        const response = await fetch(`/api/past-matches/${TEAM_ID}?limit=${MATCHES_LIMIT}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch matches: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.matches) {
            renderMatches(data.matches);
        } else {
            showError('No matches found');
        }
    } catch (error) {
        console.error('Error fetching matches:', error);
        showError('Failed to load matches');
    }
}

// Render Matches
function renderMatches(matches) {
    const grid = document.getElementById('matches-grid');
    grid.innerHTML = '';
    
    console.log(`[Past Matches] Rendering ${matches.length} matches`);
    
    if (matches.length === 0) {
        grid.innerHTML = '<div class="loading"><p>No matches found</p></div>';
        return;
    }
    
    matches.forEach((match, index) => {
        console.log(`[Past Matches] Rendering match ${index}: ${match.ourTeam} vs ${match.enemyTeam}, isSeries: ${match.isSeries}, bestOf: ${match.bestOf}`);
        const card = createMatchCard(match, index);
        grid.appendChild(card);
    });
}

// Create Match Card
function createMatchCard(match, index) {
    const card = document.createElement('div');
    card.className = `match-card ${match.isWin ? 'win' : 'loss'}`;
    if (match.isSeries) card.classList.add('series-card');
    card.style.animationDelay = `${index * 0.05}s`;
    
    const date = new Date(match.started_at * 1000);
    const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    });
    
    // Determine teams
    const ourTeam = match.ourTeam || 'TacAM';
    const enemyTeam = match.enemyTeam || 'Opponent';
    const ourScore = match.ourScore;
    const enemyScore = match.enemyScore;
    
    // Check if this is a series (BO3/BO5)
    if (match.isSeries && match.maps) {
        // BO3/BO5 Display - only show maps that were actually played
        const mapsHTML = match.maps.map(mapData => {
            const hasHalfScores = mapData.firstHalf && (mapData.firstHalf.our > 0 || mapData.firstHalf.enemy > 0 || mapData.secondHalf.our > 0 || mapData.secondHalf.enemy > 0);
            return `
                <div class="series-map ${mapData.isWin ? 'map-win' : 'map-loss'}">
                    <div class="map-label">${mapData.map}</div>
                    <div class="map-score">${mapData.ourScore}-${mapData.enemyScore}</div>
                    ${hasHalfScores ? `<div class="half-scores-inline">(${mapData.firstHalf.our}-${mapData.firstHalf.enemy} | ${mapData.secondHalf.our}-${mapData.secondHalf.enemy})</div>` : '<div class="half-scores-inline">&nbsp;</div>'}
                </div>
            `;
        }).join('');
        
        // Always show series score when we have it
        const showSeriesScore = match.hasFullSeriesScore || match.maps.length > 1;
        
        // Generate map images HTML for series
        const mapImagesHTML = match.maps.map((mapData, idx) => {
            const imgSrc = `/maps/${getMapImage(mapData.map)}`;
            return `<img src="${imgSrc}" alt="${mapData.map}" class="series-map-img series-map-img-${idx}" onerror="this.style.display='none'">`;
        }).join('');
        
        card.innerHTML = `
            <div class="match-result-badge ${match.isWin ? 'win' : 'loss'}">
                ${match.isWin ? 'WIN' : 'LOSS'}
            </div>
            
            <div class="competition-name">${match.competition_name || 'Match'} (BO${match.bestOf})</div>
            
            <div class="match-teams">
                <div class="team-box ${match.isWin ? 'winner' : 'loser'}">
                    <div class="team-name">${ourTeam}</div>
                    ${showSeriesScore ? `<div class="team-score">${ourScore}</div>` : ''}
                </div>
                
                <div class="series-maps-container">
                    ${mapsHTML}
                </div>
                
                <div class="team-box ${!match.isWin ? 'winner' : 'loser'}">
                    <div class="team-name">${enemyTeam}</div>
                    ${showSeriesScore ? `<div class="team-score">${enemyScore}</div>` : ''}
                </div>
            </div>
            
            <div class="series-map-images series-map-images-${match.maps.length}">
                ${mapImagesHTML}
            </div>
            
            <div class="match-date">${dateStr}<br>${timeStr}</div>
        `;
    } else {
        // BO1 Display (existing code)
        card.innerHTML = `
            <div class="match-result-badge ${match.isWin ? 'win' : 'loss'}">
                ${match.isWin ? 'WIN' : 'LOSS'}
            </div>
            
            <div class="competition-name">${match.competition_name || 'Match'}</div>
            
            <div class="match-teams">
                <div class="team-box ${match.isWin ? 'winner' : 'loser'}">
                    <div class="team-name">${ourTeam}</div>
                    <div class="team-score">${ourScore}</div>
                </div>
                
                <div class="map-name-center">
                    <div class="map-label">${match.map || 'UNKNOWN'}</div>
                    <div class="half-scores-inline">(${match.firstHalf.our}-${match.firstHalf.enemy} | ${match.secondHalf.our}-${match.secondHalf.enemy})</div>
                </div>
                
                <div class="team-box ${!match.isWin ? 'winner' : 'loser'}">
                    <div class="team-name">${enemyTeam}</div>
                    <div class="team-score">${enemyScore}</div>
                </div>
            </div>
            
            <div class="map-info">
                <img src="/maps/${getMapImage(match.map || 'MIRAGE')}" alt="${match.map}" class="map-image" onerror="this.style.display='none'">
            </div>
            
            <div class="match-date">${dateStr}<br>${timeStr}</div>
        `;
    }
    
    return card;
}

// Show Error
function showError(message) {
    const grid = document.getElementById('matches-grid');
    const errorEl = document.getElementById('error-message');
    
    grid.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.querySelector('p').textContent = message;
}

// Initialize
async function init() {
    console.log('[Past Matches] Initializing...');
    
    // Load partner logos
    await loadPartnerLogos();
    
    // Load video list and start playback
    videoFiles = await getVideoFiles();
    console.log(`[Video] Loaded ${videoFiles.length} videos`);
    
    if (videoFiles.length > 0) {
        videoElement.style.display = 'block';
        await playNextVideo();
    }
    
    // Fetch and display matches
    await fetchPastMatches();
}

// Start when page loads
window.addEventListener('DOMContentLoaded', init);
