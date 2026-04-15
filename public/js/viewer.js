// Konfiguration vom Server laden
let API_KEY = "";
let SHOW_VETO = true;
let REFRESH_INTERVAL = 5000;
let VIDEO_FILES = [];
let PARTNER_FILES = [];

// Match ID aus der URL extrahieren
const MATCH_ID = window.location.pathname.slice(1);

// Config vom Server laden (mit Match-spezifischen Einstellungen)
async function loadConfig() {
    try {
        const response = await fetch(/api/config/);
        const config = await response.json();
        
        API_KEY = config.apiKey;
        SHOW_VETO = config.showVeto;
        REFRESH_INTERVAL = config.refreshInterval;
        VIDEO_FILES = config.videoFiles;
        PARTNER_FILES = config.partnerFiles || [];
        
        initApp();
    } catch (error) {
        console.error('Failed to load config:', error);
        initApp();
    }
}

let timeLeft = 60;
let timerInterval;
let lastVetoCount = -1;
let hasTimerOverride = false;
let zeroTimerTimeout = null;
let isOngoingTimerRunning = false;
let renderedMaps = new Set();

const grid = document.getElementById('mapGrid');
const timerDisplay = document.getElementById('timer');
const actionDisplay = document.getElementById('current-action');
const team1Display = document.getElementById('team1Name');
const team2Display = document.getElementById('team2Name');
const team1Logo = document.getElementById('team1Logo');
const team2Logo = document.getElementById('team2Logo');
const leagueDisplay = document.getElementById('league-name');
const formatDisplay = document.getElementById('match-format');
const mapGrid = document.getElementById('mapGrid');
const overrideIndicator = document.getElementById('timer-override-indicator');
let currentVideoIndex = 0;
let youtubePlayer = null;