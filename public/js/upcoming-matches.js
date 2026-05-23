// Configuration
const CHAMPIONSHIP_ID = 'a4ec16e0-348c-455c-aaf3-96711737c397'; // ESEA League S57
const TEAM_ID = '905ca82f-1391-4a44-9840-601455a6b75e'; // TacAM Team ID
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
    
    // Set new source with correct path
    const videoFileName = encodeURIComponent(videoFile);
    videoElement.src = `/videos/${videoFileName}`;
    
    // Wait for video to be ready
    videoElement.addEventListener('canplay', function onCanPlay() {
        videoElement.removeEventListener('canplay', onCanPlay);
        videoElement.style.display = 'block';
        videoElement.play().catch(err => {
            console.error('Error playing video:', err);
            isLoadingVideo = false;
        });
        isLoadingVideo = false;
    }, { once: true });

    // Handle errors
    videoElement.addEventListener('error', function onError() {
        videoElement.removeEventListener('error', onError);
        console.error('Error loading video:', videoFile);
        isLoadingVideo = false;
        // Try next video after 1 second
        setTimeout(() => playNextVideo(), 1000);
    }, { once: true });
}

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

// Fetch Upcoming Matches
async function fetchUpcomingMatches() {
    try {
        const response = await fetch(`/api/upcoming-matches/${CHAMPIONSHIP_ID}?limit=${MATCHES_LIMIT}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch matches: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.matches && data.matches.length > 0) {
            displayMatches(data.matches);
        } else {
            showError('No upcoming matches found');
        }
    } catch (error) {
        console.error('Error fetching upcoming matches:', error);
        showError('Failed to load upcoming matches');
    }
}

// Display Matches
function displayMatches(matches) {
    const grid = document.getElementById('matches-grid');
    grid.innerHTML = ''; // Clear loading spinner
    
    matches.forEach((match, index) => {
        const card = createMatchCard(match, index);
        grid.appendChild(card);
    });
}

// Create Match Card
function createMatchCard(match, index) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.style.animationDelay = `${index * 0.05}s`;
    
    const matchDate = new Date(match.scheduled_at * 1000);
    const dateStr = matchDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
    });
    const timeStr = matchDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    });
    
    // Get team names
    const team1 = match.teams.faction1?.name || 'TBD';
    const team2 = match.teams.faction2?.name || 'TBD';
    
    // Get map (if available)
    const mapName = match.voting?.map?.pick?.[0] || 'TBD';
    const cleanMapName = mapName !== 'TBD' ? mapName.replace('de_', '').toUpperCase() : 'TBD';
    
    // Calculate time until match
    const now = Date.now();
    const timeUntil = matchDate - now;
    const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));
    const daysUntil = Math.floor(hoursUntil / 24);
    
    let statusText = 'Soon';
    if (daysUntil > 0) {
        statusText = `In ${daysUntil}d`;
    } else if (hoursUntil > 0) {
        statusText = `In ${hoursUntil}h`;
    } else if (timeUntil > 0) {
        const minutesUntil = Math.floor(timeUntil / (1000 * 60));
        statusText = `In ${minutesUntil}m`;
    }
    
    card.innerHTML = `
        <div class="match-date-badge">
            <div class="date-day">${dateStr}</div>
            <div class="date-time">${timeStr}</div>
        </div>
        
        <div class="competition-name">${match.competition_name || 'League Match'}</div>
        
        <div class="match-teams">
            <div class="team-box">
                <div class="team-name-upcoming">${team1}</div>
            </div>
            
            <div class="vs-divider">VS</div>
            
            <div class="team-box">
                <div class="team-name-upcoming">${team2}</div>
            </div>
        </div>
        
        <div class="map-info">
            ${cleanMapName !== 'TBD' 
                ? `<img src="/maps/${getMapImage(cleanMapName)}" alt="${cleanMapName}" class="map-image" onerror="this.parentElement.innerHTML='<div class=\\'map-placeholder\\'>${cleanMapName}</div>'">` 
                : `<div class="map-placeholder">Map TBD</div>`
            }
        </div>
        
        <div class="match-status">
            <div class="status-label">Starts</div>
            <div class="status-value">${statusText}</div>
        </div>
    `;
    
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
    // Load video files
    videoFiles = await getVideoFiles();
    
    // Setup video loop
    if (videoFiles.length > 0) {
        videoElement.addEventListener('ended', playNextVideo);
        playNextVideo(); // Start first video
    }
    
    // Load partner logos
    loadPartnerLogos();
    
    // Load matches
    fetchUpcomingMatches();
}

// Start when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
