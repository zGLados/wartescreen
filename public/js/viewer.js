// Konfiguration vom Server laden
        let API_KEY = "";
        let SHOW_VETO = true;
        let REFRESH_INTERVAL = 5000;
        let VIDEO_FILES = [];
        let PARTNER_FILES = [];

        // Match ID aus der URL extrahieren
        const MATCH_ID = window.location.pathname.slice(1); // Entfernt den führenden "/"

        // Config vom Server laden (mit Match-spezifischen Einstellungen)
        async function loadConfig() {
            try {
                const response = await fetch(`/api/config/${MATCH_ID}`);
                const config = await response.json();
                
                API_KEY = config.apiKey;
                SHOW_VETO = config.showVeto;
                REFRESH_INTERVAL = config.refreshInterval;
                VIDEO_FILES = config.videoFiles;
                PARTNER_FILES = config.partnerFiles || [];
                
                // Nach dem Laden der Config initialisieren
                initApp();
            } catch (error) {
                console.error('Failed to load config:', error);
                // Fallback zu Standardwerten
                initApp();
            }
        }

        let timeLeft = 60;
        let timerInterval;
        let lastVetoCount = -1;
        let hasTimerOverride = false;
        let zeroTimerTimeout = null;
        let isOngoingTimerRunning = false;
        let renderedMaps = new Set(); // Tracke bereits gerenderte Maps
        let lastMatchStatus = null; // Tracke Status-Wechsel
        
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

        function startTimer(duration = 120) {
            clearInterval(timerInterval);
            if (zeroTimerTimeout) {
                clearTimeout(zeroTimerTimeout);
                zeroTimerTimeout = null;
            }
            timeLeft = duration;
            updateTimerDisplay();
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateTimerDisplay();
                } else if (timeLeft === 0) {
                    clearInterval(timerInterval);
                    timerInterval = null; // Auf null setzen damit neuer Timer gestartet werden kann
                    // Nach 5 Sekunden "Soon™" anzeigen
                    zeroTimerTimeout = setTimeout(() => {
                        timerDisplay.textContent = "Soon™";
                    }, 5000);
                }
            }, 1000);
        }

        function updateTimerDisplay() {
            const hrs = Math.floor(timeLeft / 3600);
            const mins = Math.floor((timeLeft % 3600) / 60);
            const secs = timeLeft % 60;
            let timeString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            if (hrs > 0) {
                timeString = `${hrs.toString().padStart(2, '0')}:${timeString}`;
            }
            timerDisplay.textContent = timeString;
        }

        // Map Name zu Bild-URL Mapping (mit Fallbacks)
        function getMapImage(mapName) {
            const normalizedName = mapName.toLowerCase().replace(/\s+/g, '');
            
            // Map-Namen Mapping zu Dateinamen
            const mapImages = {
                'ancient': 'CS2_de_ancient.png',
                'anubis': 'CS2_de_anubis.png',
                'dust2': 'CS2_Dust_2_A_Site.jpg',
                'dust 2': 'CS2_Dust_2_A_Site.jpg',
                'inferno': 'CS2_de_inferno.png',
                'mirage': 'CS2_de_mirage.png',
                'nuke': 'CS2_de_nuke.png',
                'vertigo': 'CS2_de_vertigo.png',
                'overpass': 'CS2_de_overpass.png'
            };
            
            const imageFile = mapImages[normalizedName];
            
            if (imageFile) {
                return `/maps/${imageFile}`;
            }
            
            return null;
        }

        function initBackgroundVideo() {
            if (VIDEO_FILES && VIDEO_FILES.length > 0) {
                initLocalVideos();
            }
        }

        // Partner-Logos laden und anzeigen
        function initPartners() {
            const partnerBar = document.getElementById('partnerBar');
            const fallbackLogo = document.getElementById('tacamFallback');
            
            if (PARTNER_FILES && PARTNER_FILES.length > 0) {
                // Echte Partner-Logos vorhanden - Fallback entfernen
                if (fallbackLogo) {
                    fallbackLogo.remove();
                }
                
                // Partner-Logos einfügen
                PARTNER_FILES.forEach(file => {
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
            // Wenn keine Partner-Logos, bleibt das Fallback-Logo sichtbar
        }

        // Lokale Videos initialisieren
        function initLocalVideos() {
            const videoElement = document.getElementById('bg-video-local');
            videoElement.style.display = 'block';
            
            if (videoElement && VIDEO_FILES.length > 0) {
                // Zufälliges Start-Video
                currentVideoIndex = Math.floor(Math.random() * VIDEO_FILES.length);
                
                videoElement.onended = () => {
                    // Wähle ein anderes zufälliges Video (nicht dasselbe)
                    if (VIDEO_FILES.length > 1) {
                        let newIndex;
                        do {
                            newIndex = Math.floor(Math.random() * VIDEO_FILES.length);
                        } while (newIndex === currentVideoIndex);
                        currentVideoIndex = newIndex;
                    }
                    playNextLocalVideo();
                };
                playNextLocalVideo();
            }
        }

        function playNextLocalVideo() {
            const videoElement = document.getElementById('bg-video-local');
            if (!videoElement) return;
            videoElement.src = `/videos/${VIDEO_FILES[currentVideoIndex]}`;
            videoElement.play().catch(e => console.log("Video Autoplay failed:", e));
        }

        async function checkTimerOverride(scheduledAt) {
            try {
                const response = await fetch(`/api/timer/${MATCH_ID}`);
                const data = await response.json();
                
                // Wenn Match in der Zukunft liegt, ignoriere Timer-Override
                if (scheduledAt) {
                    const now = Math.floor(Date.now() / 1000);
                    const timeUntilMatch = scheduledAt - now;
                    
                    if (timeUntilMatch > 0) {
                        // Match liegt in der Zukunft - verwende FACEIT Timer
                        hasTimerOverride = false;
                        overrideIndicator.style.display = 'none';

                        return;
                    }
                }
                
                // Match hat bereits begonnen oder kein scheduled_at - verwende Override
                if (data.hasOverride) {
                    hasTimerOverride = true;
                    overrideIndicator.style.display = 'block';
                    
                    // Timer nur starten wenn noch keiner läuft oder große Differenz (Admin hat Timer geändert)
                    if (!timerInterval) {
                        startTimer(data.remaining);
                    } else if (Math.abs(timeLeft - data.remaining) > 10) {
                        // Nur bei großer Differenz (>10s) neu starten - Admin hat Timer manuell geändert
                        startTimer(data.remaining);
                    }
                } else {
                    hasTimerOverride = false;
                    overrideIndicator.style.display = 'none';
                }
            } catch (error) {
                console.error('Timer Override Check Error:', error);
            }
        }

        async function fetchMatchData() {
            if (!SHOW_VETO) {
                await fetchAndRenderSimpleCountdown();
                return;
            }
            
            if (!MATCH_ID || !API_KEY) {
                console.error('Missing MATCH_ID or API_KEY');
                actionDisplay.textContent = "Error: Match ID or API Key is missing!";
                return;
            }

            try {
                const apiUrl = `https://open.faceit.com/data/v4/matches/${MATCH_ID}`;
                const response = await fetch(apiUrl, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status}`);
                }

                const data = await response.json();
                
                // Prüfe Timer-Override mit scheduled_at
                await checkTimerOverride(data.scheduled_at);
                
                renderVeto(data);
            } catch (error) {
                console.error("FACEIT API Error:", error);
                actionDisplay.textContent = `Failed to connect to FACEIT: ${error.message}`;
            }
        }

        async function fetchAndRenderSimpleCountdown() {
            if (!MATCH_ID || !API_KEY) {
                actionDisplay.textContent = "Error: Match ID or API Key is missing!";
                return;
            }
            try {
                const apiUrl = `https://open.faceit.com/data/v4/matches/${MATCH_ID}`;
                const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const data = await response.json();
                
                // Prüfe Timer-Override mit scheduled_at
                await checkTimerOverride(data.scheduled_at);
                
                // Bei FINISHED Status immer Outro anzeigen (egal ob SHOW_VETO an oder aus)
                if (data.status === 'FINISHED') {
                    showOutroView(data);
                    return;
                }
                
                renderSimpleCountdown(data);
            } catch (error) {
                console.error("FACEIT API Error:", error);
                actionDisplay.textContent = `Failed to connect to FACEIT: ${error.message}`;
            }
        }

        function renderVeto(data) {
            // Bei FINISHED Status immer Outro anzeigen
            if (data.status === 'FINISHED') {
                showOutroView(data);
                return;
            }
            
            if (!SHOW_VETO) return;

            // Map Grid wieder anzeigen, falls es vorher versteckt wurde
            mapGrid.style.display = 'flex';

            const teams = [data.teams.faction1, data.teams.faction2];
            const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
            if (tacamIndex === 1) teams.reverse();
            const [team1Data, team2Data] = teams;

            team1Display.textContent = team1Data.name;
            team2Display.textContent = team2Data.name;
            team1Logo.src = team1Data.avatar || 'https://via.placeholder.com/100?text=' + encodeURIComponent(team1Data.name);
            team2Logo.src = team2Data.avatar || 'https://via.placeholder.com/100?text=' + encodeURIComponent(team2Data.name);

            leagueDisplay.textContent = data.competition_name || "FACEIT Match";
            formatDisplay.textContent = `Best of ${data.best_of || '?'}`;

            if (!data.voting || !data.voting.map) {
                // Kein Veto vorhanden - nutze Status-basierte Anzeige
                updateStatusText(data);
                return;
            }

            const voting = data.voting.map;
            const entities = voting.entities;
            const picks = voting.pick || [];
            const bans = voting.drop || [];

            const totalActions = picks.length + bans.length;
            if (totalActions > lastVetoCount && !hasTimerOverride) {
                lastVetoCount = totalActions;
                // Nur Timer starten wenn noch keiner läuft
                if (!timerInterval) {
                    startTimer();
                }
            }

            // Erstelle eine Map der bestehenden sichtbaren Karten für schnellen Zugriff
            const existingCards = new Map();
            Array.from(grid.children).forEach(card => {
                const mapName = card.querySelector('.map-name')?.textContent;
                const isVisible = parseFloat(window.getComputedStyle(card).opacity) > 0;
                if (mapName && isVisible) {
                    existingCards.set(mapName, card);
                }
            });

            // Zähle nur sichtbare Maps für Animation-Delay
            const visibleMapCount = Array.from(grid.children).filter(card => {
                return parseFloat(window.getComputedStyle(card).opacity) > 0;
            }).length;

            // Bei BO1: Alle nicht-gepickten Maps sind gebannt
            const bestOf = data.best_of || 1;
            const bannedMaps = [];
            
            if (bestOf === 1 && picks.length > 0) {
                // Sammle alle Maps die nicht gepickt wurden - das sind die gebannten
                entities.forEach(map => {
                    const isPicked = picks.includes(map.guid) || picks.includes(map.class_name);
                    if (!isPicked) {
                        bannedMaps.push(map);
                    }
                });
            }

            // Sortiere Maps: Gepickte Karte zuletzt
            const sortedMaps = [];
            const pickedMaps = [];
            
            entities.forEach((map) => {
                const isPicked = picks.includes(map.guid) || picks.includes(map.class_name);
                if (isPicked) {
                    pickedMaps.push(map);
                } else {
                    sortedMaps.push(map);
                }
            });
            
            // Füge gepickte Maps am Ende hinzu
            const finalMaps = [...sortedMaps, ...pickedMaps];

            let currentAnimationIndex = 0; // Zähler für neue Maps

            finalMaps.forEach((map, index) => {
                const isPicked = picks.includes(map.guid) || picks.includes(map.class_name);
                const isBanned = (bestOf === 1 && !isPicked) || 
                                 bans.includes(map.guid) || 
                                 bans.includes(map.class_name);
                
                const mapKey = map.guid || map.class_name;
                const existingCard = existingCards.get(map.name);
                
                // Prüfe ob diese Map bereits im Grid existiert (auch wenn noch nicht sichtbar)
                const alreadyInGrid = Array.from(grid.children).some(card => 
                    card.querySelector('.map-name')?.textContent === map.name
                );
                
                if (existingCard) {
                    // Map ist bereits sichtbar - nur Klassen aktualisieren
                    existingCard.className = 'map-card';
                    if (isPicked) existingCard.classList.add('picked');
                    if (isBanned) existingCard.classList.add('banned');
                    existingCards.delete(map.name); // Markiere als verarbeitet
                } else if (alreadyInGrid) {
                    // Map existiert im DOM aber ist noch nicht sichtbar (Animation läuft noch)
                    // Nichts tun - Animation läuft weiter
                } else {
                    // Neue Map erstellen
                    const card = document.createElement('div');
                    card.className = 'map-card';
                    if (isPicked) card.classList.add('picked');
                    if (isBanned) card.classList.add('banned');
                    
                    // Neue Map: Animiere sie mit Delay basierend auf sichtbaren Maps + neue Maps davor
                    card.style.animationDelay = `${(visibleMapCount + currentAnimationIndex) * 2}s`;
                    currentAnimationIndex++; // Inkrementiere für nächste neue Map
                    renderedMaps.add(mapKey);
                    
                    // Priorisierung: 1. FACEIT image_lg, 2. Lokale Bilder, 3. Placeholder
                    const mapImg = map.image_lg || getMapImage(map.name) || `https://via.placeholder.com/150x200?text=${map.name}`;

                    card.innerHTML = `
                        <img src="${mapImg}" alt="${map.name}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150x200?text=${map.name}';">
                        <div class="status-label">${getStatusLabel(map, data, bannedMaps)}</div>
                        <div class="map-name">${map.name}</div>
                    `;
                    grid.appendChild(card);
                }
            });

            // Entferne Maps die nicht mehr in der Liste sind (sollte nicht passieren, aber sicherheitshalber)
            existingCards.forEach(card => card.remove());

            updateStatusText(data);
        }

        function renderSimpleCountdown(data) {
            if (!data || !data.teams) {
                return;
            }
            
            const teams = [data.teams.faction1, data.teams.faction2];
            const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
            if (tacamIndex === 1) teams.reverse();
            const [team1Data, team2Data] = teams;

            team1Display.textContent = team1Data.name;
            team2Display.textContent = team2Data.name;
            team1Logo.src = team1Data.avatar || `https://via.placeholder.com/100?text=${encodeURIComponent(team1Data.name)}`;
            team2Logo.src = team2Data.avatar || `https://via.placeholder.com/100?text=${encodeURIComponent(team2Data.name)}`;
            
            leagueDisplay.textContent = data.competition_name || "FACEIT Match";
            formatDisplay.textContent = `Best of ${data.best_of || '?'}`;

            mapGrid.style.display = 'none';
            actionDisplay.textContent = "Stream starting soon...";

            // Wenn kein Timer-Override aktiv ist, nutze die FACEIT-Zeit
            if (!hasTimerOverride && data.scheduled_at) {
                const now = Math.floor(Date.now() / 1000);
                const diff = data.scheduled_at - now;
                if (diff > 0) {
                    // Nur Timer starten wenn noch keiner läuft
                    if (!timerInterval) {
                        startTimer(diff);
                    }
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    timerDisplay.textContent = "00:00";
                }
            } else if (!hasTimerOverride) {
                clearInterval(timerInterval);
                timerInterval = null;
                timerDisplay.textContent = "00:00";
            }
        }

        function getStatusLabel(map, data, bannedMaps = []) {
            const picks = data.voting.map.pick || [];
            const drops = data.voting.map.drop || [];
            
            // Prüfe ob gepickt
            if (picks.includes(map.guid) || picks.includes(map.class_name)) {
                return "PICKED";
            }
            
            // Wenn explizite Bans vorhanden sind oder bei BO1 alle nicht-gepickten Maps
            if (drops.includes(map.guid) || drops.includes(map.class_name)) {
                return "BANNED";
            }
            
            // Bei BO1: Alle nicht-gepickten Maps sind gebannt
            const bestOf = data.best_of || 1;
            if (bestOf === 1 && bannedMaps.length > 0) {
                const isBanned = bannedMaps.some(m => 
                    m.guid === map.guid || m.class_name === map.class_name
                );
                if (isBanned) {
                    return "BANNED";
                }
            }
            
            return "";
        }

        function showOutroView(data) {
            // Verstecke alle UI-Elemente außer Video und Partner-Bar
            mapGrid.style.display = 'none';
            const header = document.querySelector('.header');
            if (header) header.style.display = 'none';
            
            // Background Video und Partner-Bar bleiben sichtbar!
            
            // Erstelle Outro-Container falls noch nicht vorhanden
            let outroContainer = document.getElementById('outro-container');
            if (!outroContainer) {
                outroContainer = document.createElement('div');
                outroContainer.id = 'outro-container';
                outroContainer.style.cssText = `
                    position: relative;
                    z-index: 10;
                    text-align: center;
                    padding-top: 100px;
                    animation: fadeIn 1s ease;
                `;
                // Füge vor dem Partner-Bar ein
                const partnerBar = document.getElementById('partnerBar');
                if (partnerBar) {
                    document.body.insertBefore(outroContainer, partnerBar);
                } else {
                    document.body.appendChild(outroContainer);
                }
            }
            
            const teams = [data.teams.faction1, data.teams.faction2];
            
            // Sort teams so tacam is always on the left
            const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
            const teamsSwapped = tacamIndex === 1;
            if (teamsSwapped) teams.reverse();
            
            // Hole Scores aus den results wenn verfügbar
            let team1Score = 0;
            let team2Score = 0;
            let winnerId = null;

            if (data.results && data.results.score) {
                const scores = data.results.score;
                
                // FACEIT verwendet "faction1" und "faction2" als Keys, nicht die faction_id!
                // Wenn Teams getauscht wurden, müssen auch die Scores getauscht werden
                if (teamsSwapped) {
                    team1Score = scores.faction2 || 0;
                    team2Score = scores.faction1 || 0;
                } else {
                    team1Score = scores.faction1 || 0;
                    team2Score = scores.faction2 || 0;
                }
                
                // Winner ist auch "faction1" oder "faction2", nicht die faction_id
                const winner = data.results.winner;
                if (winner === 'faction1') {
                    winnerId = teamsSwapped ? teams[1].faction_id : teams[0].faction_id;
                } else if (winner === 'faction2') {
                    winnerId = teamsSwapped ? teams[0].faction_id : teams[1].faction_id;
                }
            }
            
            // Hole gespielte Map
            let playedMap = '';
            if (data.voting && data.voting.map && data.voting.map.pick && data.voting.map.pick.length > 0) {
                const mapId = data.voting.map.pick[0];
                const mapNames = {
                    'de_dust2': 'Dust2',
                    'de_mirage': 'Mirage',
                    'de_nuke': 'Nuke',
                    'de_overpass': 'Overpass',
                    'de_ancient': 'Ancient',
                    'de_inferno': 'Inferno',
                    'de_anubis': 'Anubis',
                    'de_vertigo': 'Vertigo'
                };
                playedMap = mapNames[mapId] || mapId;
            }

            // Baue Outro HTML mit gleichem Style wie die Hauptseite
            outroContainer.innerHTML = `
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    #outro-container {
                        animation: fadeIn 1s ease;
                    }
                    .outro-title {
                        font-size: 3rem;
                        font-weight: 700;
                        color: var(--accent-red);
                        text-transform: uppercase;
                        letter-spacing: 4px;
                        margin-bottom: 15px;
                        text-shadow: 0 0 30px rgba(200, 55, 55, 0.5);
                    }
                    .outro-subtitle {
                        font-size: 1.3rem;
                        color: #aaa;
                        margin-bottom: 40px;
                    }
                    .outro-score-container {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 50px;
                        margin: 40px 0;
                    }
                    .outro-team {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        min-width: 200px;
                    }
                    .outro-team-logo {
                        width: 120px;
                        height: 120px;
                        margin-bottom: 15px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .outro-team-logo img {
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                        filter: drop-shadow(0 0 15px rgba(255,255,255,0.3));
                    }
                    .outro-team-name {
                        font-size: 1.5rem;
                        font-weight: 600;
                        margin-bottom: 10px;
                    }
                    .outro-team-name-home {
                        color: var(--accent-blue);
                    }
                    .outro-team-name-away {
                        color: var(--accent-red);
                    }
                    .outro-team-score {
                        font-size: 4rem;
                        font-weight: 900;
                        color: var(--accent-red);
                        text-shadow: 0 0 40px rgba(200, 55, 55, 0.6);
                        font-family: monospace;
                    }
                    .outro-vs {
                        font-size: 2.5rem;
                        color: #555;
                        font-weight: 300;
                    }
                    .outro-winner-badge {
                        display: inline-block;
                        background: linear-gradient(135deg, var(--pick-green) 0%, #27ae60 100%);
                        color: #fff;
                        padding: 6px 16px;
                        border-radius: 20px;
                        font-size: 0.9rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        margin-top: 10px;
                        box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
                    }
                    .outro-thank-you {
                        margin-top: 60px;
                        margin-bottom: 40px;
                    }
                    .outro-thank-you h2 {
                        font-size: 2.5rem;
                        font-weight: 300;
                        color: var(--text-color);
                    }
                    .outro-map-info {
                        margin-top: 40px;
                        font-size: 1.2rem;
                        color: #888;
                    }
                    .outro-map-info strong {
                        color: var(--accent-red);
                        font-size: 1.4rem;
                    }
                </style>
                <div class="outro-title">MATCH COMPLETE</div>
                <div class="outro-subtitle">Final Score</div>
                
                <div class="outro-score-container">
                    <div class="outro-team">
                        <div class="outro-team-logo">
                            <img src="${teams[0].avatar || 'https://via.placeholder.com/150'}" alt="${teams[0].name}">
                        </div>
                        <div class="outro-team-name outro-team-name-home">${teams[0].name}</div>
                        <div class="outro-team-score">${team1Score}</div>
                        ${winnerId === teams[0].faction_id ? '<div class="outro-winner-badge">WINNER</div>' : ''}
                    </div>

                    <div class="outro-vs">:</div>

                    <div class="outro-team">
                        <div class="outro-team-logo">
                            <img src="${teams[1].avatar || 'https://via.placeholder.com/150'}" alt="${teams[1].name}">
                        </div>
                        <div class="outro-team-name outro-team-name-away">${teams[1].name}</div>
                        <div class="outro-team-score">${team2Score}</div>
                        ${winnerId === teams[1].faction_id ? '<div class="outro-winner-badge">WINNER</div>' : ''}
                    </div>
                </div>
                
                ${playedMap ? `<div class="outro-map-info">Played on <strong>${playedMap}</strong></div>` : ''}
                
                <div class="outro-thank-you">
                    <h2>Thank You for Watching!</h2>
                </div>
            `;
        }

        function updateStatusText(data) {
            const now = Math.floor(Date.now() / 1000);
            
            // Bei Statuswechsel Timer resetten (außer bei Manual Override)
            if (lastMatchStatus !== null && lastMatchStatus !== data.status && !hasTimerOverride) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            lastMatchStatus = data.status;
            
            // Reset ONGOING flag wenn Status nicht ONGOING ist
            if (data.status !== 'ONGOING') {
                isOngoingTimerRunning = false;
            }
            
            // FACEIT Status-Mapping
            switch(data.status) {
                case 'FINISHED':
                    // Outro will already be handled in renderVeto/fetchAndRenderSimpleCountdown
                    actionDisplay.textContent = "Match finished!";
                    if (!hasTimerOverride) clearInterval(timerInterval);
                    break;
                    
                case 'READY':
                    // Match is ready - show "Time to connect" if configured_at exists
                    if (data.configured_at && data.configured_at > now - 600) {
                        actionDisplay.textContent = "Time to connect!";
                        if (!hasTimerOverride && !timerInterval) {
                            // 10 minutes timer from configured_at
                            const elapsed = now - data.configured_at;
                            const remaining = Math.max(0, 600 - elapsed);
                            if (remaining > 0) startTimer(remaining);
                        }
                    } else {
                        actionDisplay.textContent = "Match is ready!";
                    }
                    break;
                    
                case 'ONGOING':
                    actionDisplay.textContent = "Match is live!";
                    if (!hasTimerOverride && !isOngoingTimerRunning && !timerInterval) {
                        // 2 Minuten Timer für FACEIT Delay (nur einmal starten)
                        isOngoingTimerRunning = true;
                        startTimer(120);
                    }
                    break;
                    
                case 'CONFIGURING':
                    actionDisplay.textContent = "Setting lineup...";
                    // Lineup phase has 3 minutes timer from configured_at
                    if (data.configured_at && data.configured_at > now - 180) {
                        if (!hasTimerOverride && !timerInterval) {
                            const elapsed = now - data.configured_at;
                            const remaining = Math.max(0, 180 - elapsed);
                            if (remaining > 0) startTimer(remaining);
                        }
                    }
                    break;
                    
                case 'CHECKING_IN':
                    actionDisplay.textContent = "Check-in in progress...";
                    if (data.scheduled_at && data.scheduled_at > now) {
                        if (!hasTimerOverride && !timerInterval) {
                            const diff = data.scheduled_at - now;
                            startTimer(diff);
                        }
                    }
                    break;
                    
                case 'CANCELLED':
                case 'ABORTED':
                    actionDisplay.textContent = "Match cancelled";
                    if (!hasTimerOverride) clearInterval(timerInterval);
                    break;
                    
                default:
                    // Fallback: Check scheduled_at for "Upcoming match"
                    if (data.scheduled_at && data.scheduled_at > now) {
                        actionDisplay.textContent = "Upcoming match";
                        if (!hasTimerOverride && !timerInterval) {
                            const diff = data.scheduled_at - now;
                            startTimer(diff);
                        }
                    } else if (data.voting && data.voting.map && data.voting.map.pick && data.voting.map.pick.length > 0) {
                        actionDisplay.textContent = "Veto finished!";
                    } else {
                        actionDisplay.textContent = "Veto in progress...";
                    }
                    break;
            }
        }

        // App initialisieren (wird nach Config-Laden aufgerufen)
        function initApp() {
            fetchMatchData();
            setInterval(fetchMatchData, REFRESH_INTERVAL);
            initBackgroundVideo();
            initPartners();
        }

        // Config laden und App starten
        loadConfig();