// Load configuration from server
        let API_KEY = "";
        let SHOW_VETO = true;
        let REFRESH_INTERVAL = 5000;
        let VIDEO_FILES = [];
        let PARTNER_FILES = [];
        let VETO_START_SIDE = 'left'; // 'left' or 'right' - which team starts veto (auto-detected from API)
        let HIDE_TIMER_AFTER_VETO = false; // Hide timer when veto is complete

        // Extract Match ID from URL
        const MATCH_ID = window.location.pathname.slice(1); // Remove leading "/"

        // Load config from server (with match-specific settings)
        async function loadConfig() {
            try {
                const response = await fetch(`/api/config/${MATCH_ID}`);
                
                // Check if response is OK and contains JSON
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Server did not return JSON');
                }
                
                const config = await response.json();
                
                API_KEY = config.apiKey;
                SHOW_VETO = config.showVeto;
                REFRESH_INTERVAL = config.refreshInterval;
                VIDEO_FILES = config.videoFiles;
                PARTNER_FILES = config.partnerFiles || [];
                HIDE_TIMER_AFTER_VETO = config.hideTimerAfterVeto || false;
                
                // Check if veto start side was manually set by admin
                if (config.vetoStartSide && config.vetoStartSide !== 'auto') {
                    VETO_START_SIDE = config.vetoStartSide;
                    hasManualVetoStartSide = true;
                } else {
                    // Will be auto-detected from API data
                    VETO_START_SIDE = 'left';
                    hasManualVetoStartSide = false;
                }
                
                // Initialize after loading config
                initApp();
            } catch (error) {
                console.error('Failed to load config:', error);
                // Fallback to default values
                initApp();
            }
        }

        let timeLeft = 60;
        let timerInterval;
        let lastVetoCount = -1;
        let hasTimerOverride = false;
        let hasManualVetoStartSide = false; // Track if admin manually set veto start side
        let isVetoComplete = false; // Track if veto process is complete
        let zeroTimerTimeout = null;
        let isOngoingTimerRunning = false;
        let renderedMaps = new Set(); // Track already rendered maps
        let lastMatchStatus = null; // Track status changes
        let mapGridInitialized = false; // Track if map grid was shown once
        
        const grid = document.getElementById('mapGrid');
        const timerDisplay = document.getElementById('timer');
        const actionDisplay = document.getElementById('current-action');
        const team1Display = document.getElementById('team1Name');
        const team2Display = document.getElementById('team2Name');
        const team1Logo = document.getElementById('team1Logo');
        const team2Logo = document.getElementById('team2Logo');
        
        // Fallback for team2 logo if image fails to load
        team2Logo.onerror = function() {
            if (this.src !== window.location.origin + '/logo_T_default.png') {
                this.src = '/logo_T_default.png';
            }
        };
        
        const leagueDisplay = document.getElementById('league-name');
        const formatDisplay = document.getElementById('match-format');
        const mapGrid = document.getElementById('mapGrid');
        const overrideIndicator = document.getElementById('timer-override-indicator');
        let currentVideoIndex = 0;
        let youtubePlayer = null;
        let isLoadingVideo = false;

        function startTimer(duration = 180) {
            clearInterval(timerInterval);
            if (zeroTimerTimeout) {
                clearTimeout(zeroTimerTimeout);
                zeroTimerTimeout = null;
            }
            timeLeft = duration;
            updateTimerDisplay();
            
            // If timer starts at 0, show Soon™ after 5 seconds
            if (timeLeft === 0) {
                timerInterval = null;
                zeroTimerTimeout = setTimeout(() => {
                    timerDisplay.textContent = "Soon™";
                }, 5000);
                return;
            }
            
            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateTimerDisplay();
                } else if (timeLeft === 0) {
                    clearInterval(timerInterval);
                    timerInterval = null; // Set to null so new timer can be started
                    // Show "Soon™" after 5 seconds
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

        // Map Name to Image URL Mapping (with fallbacks)
        function getMapImage(mapName) {
            const normalizedName = mapName.toLowerCase().replace(/\s+/g, '');
            
            // Map names mapping to filenames
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

        // Load and display partner logos
        function initPartners() {
            const partnerBar = document.getElementById('partnerBar');
            const fallbackLogo = document.getElementById('tacamFallback');
            
            if (PARTNER_FILES && PARTNER_FILES.length > 0) {
                // Real partner logos available - remove fallback
                if (fallbackLogo) {
                    fallbackLogo.remove();
                }
                
                // Insert partner logos
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
            // If no partner logos, fallback logo remains visible
        }

        // Initialize local videos
        function initLocalVideos() {
            const videoElement = document.getElementById('bg-video-local');
            videoElement.style.display = 'block';
            
            if (videoElement && VIDEO_FILES.length > 0) {
                // Random start video
                currentVideoIndex = Math.floor(Math.random() * VIDEO_FILES.length);
                
                videoElement.addEventListener('ended', playNextLocalVideo);
                videoElement.addEventListener('error', (e) => {
                    console.error('Video error:', e);
                    isLoadingVideo = false;
                    setTimeout(playNextLocalVideo, 1000);
                });
                
                // Page Visibility API: Only load videos when page is visible
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        // Page hidden - pause video to save bandwidth
                        videoElement.pause();
                        console.log('[Video] Page hidden - paused video');
                    } else {
                        // Page visible - resume video
                        if (!isLoadingVideo && videoElement.paused) {
                            videoElement.play().catch(err => {
                                console.log('[Video] Resume failed:', err);
                            });
                            console.log('[Video] Page visible - resumed video');
                        }
                    }
                });
                
                // Start playing (works in OBS and normal browsers)
                playNextLocalVideo();
                console.log('[Video] Starting video (visibility:', document.hidden ? 'hidden' : 'visible', ')');
                
                // Fallback: If video hasn't started after 5 seconds, force start
                // This helps with OBS Browser Sources and edge cases
                setTimeout(() => {
                    if (videoElement.paused && !isLoadingVideo) {
                        console.warn('[Video] Fallback: forcing video start');
                        playNextLocalVideo();
                    }
                }, 5000);
            }
        }

        function playNextLocalVideo() {
            if (isLoadingVideo) return;
            
            const videoElement = document.getElementById('bg-video-local');
            if (!videoElement || VIDEO_FILES.length === 0) return;
            
            // Choose another random video (not the same)
            if (VIDEO_FILES.length > 1) {
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * VIDEO_FILES.length);
                } while (newIndex === currentVideoIndex);
                currentVideoIndex = newIndex;
            }
            
            isLoadingVideo = true;
            let loadingTimeout = null;
            let hasStartedPlaying = false;
            
            // Clear old source
            videoElement.pause();
            videoElement.removeAttribute('src');
            videoElement.load();
            
            // Set new video source (URL-encode the filename)
            const videoFileName = encodeURIComponent(VIDEO_FILES[currentVideoIndex]);
            videoElement.src = `/videos/${videoFileName}`;
            videoElement.preload = 'auto'; // Aggressive preloading
            
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
            
            // Listen for when enough data is loaded to play
            videoElement.addEventListener('canplaythrough', function onCanPlayThrough() {
                videoElement.removeEventListener('canplaythrough', onCanPlayThrough);
                startPlayback();
            }, { once: true });
            
            // Fallback to canplay if canplaythrough takes too long
            setTimeout(() => {
                if (!hasStartedPlaying && videoElement.readyState >= 3) {
                    startPlayback();
                }
            }, 3000);
            
            // Extended timeout for slow connections (30 seconds)
            loadingTimeout = setTimeout(() => {
                if (!hasStartedPlaying) {
                    console.warn('Video loading timeout, skipping to next');
                    isLoadingVideo = false;
                    playNextLocalVideo();
                }
            }, 30000);
            
            // Handle stalling during playback
            videoElement.addEventListener('waiting', function onWaiting() {
                console.log('Video buffering...');
            });
            
            videoElement.addEventListener('stalled', function onStalled() {
                console.warn('Video stalled, may skip soon');
            });
        }

        async function checkTechDifficulties() {
            try {
                const response = await fetch(`/api/tech-difficulties/${MATCH_ID}`);
                const data = await response.json();
                
                const overlay = document.getElementById('tech-difficulties-overlay');
                if (overlay) {
                    if (data.active) {
                        overlay.style.display = 'flex';
                    } else {
                        overlay.style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('Tech Difficulties Check Error:', error);
            }
        }

        async function checkTimerOverride(scheduledAt) {
            try {
                const response = await fetch(`/api/timer/${MATCH_ID}`);
                const data = await response.json();
                
                const wasOverrideActive = hasTimerOverride;
                
                // Admin timer ALWAYS has priority when set
                if (data.hasOverride) {
                    hasTimerOverride = true;
                    // Don't show indicator on viewer page
                    
                    // Only start timer if none is running or large difference (admin changed timer)
                    // Don't restart if timer is at 0 and Soon™ timeout is pending
                    if (!timerInterval && !zeroTimerTimeout) {
                        startTimer(data.remaining);
                    } else if (timerInterval && Math.abs(timeLeft - data.remaining) > 10) {
                        // Only restart on large difference (>10s) - admin manually changed timer
                        startTimer(data.remaining);
                    }
                } else {
                    hasTimerOverride = false;
                    // Don't show indicator on viewer page
                    
                    // If override was just cleared, immediately fetch FACEIT data and start automatic timers
                    if (wasOverrideActive) {
                        console.log('[Timer Override] Cleared - switching to automatic timers');
                        clearInterval(timerInterval);
                        timerInterval = null;
                        
                        // Clear any pending Soon™ timeout
                        if (zeroTimerTimeout) {
                            clearTimeout(zeroTimerTimeout);
                            zeroTimerTimeout = null;
                        }
                        
                        fetchMatchData();
                    }
                }
            } catch (error) {
                console.error('Timer Override Check Error:', error);
            }
        }

        async function fetchMatchData() {
            // Check for tech difficulties overlay
            await checkTechDifficulties();
            
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
                // Check for manual veto data first
                const manualVetoResponse = await fetch(`/api/manual-veto/${MATCH_ID}`);
                const manualVetoData = await manualVetoResponse.json();
                
                // Fetch FACEIT API data
                const apiUrl = `https://open.faceit.com/data/v4/matches/${MATCH_ID}`;
                const response = await fetch(apiUrl, {
                    headers: { 'Authorization': `Bearer ${API_KEY}` }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP Error: ${response.status}`);
                }

                const data = await response.json();
                
                // Check timer override with scheduled_at
                await checkTimerOverride(data.scheduled_at);
                
                // Use manual veto if available, otherwise use FACEIT API data
                if (manualVetoData.hasManualVeto) {
                    console.log('[Manual Veto] Using manual veto data');
                    renderManualVeto(data, manualVetoData.vetoData);
                } else {
                    renderVeto(data);
                }
            } catch (error) {
                console.error("FACEIT API Error:", error);
                actionDisplay.textContent = `Failed to connect to FACEIT: ${error.message}`;
            }
        }

        async function fetchAndRenderSimpleCountdown() {
            // Check for tech difficulties overlay
            await checkTechDifficulties();
            
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
                
                // Check timer override with scheduled_at
                await checkTimerOverride(data.scheduled_at);
                
                // Always show outro on FINISHED status (whether SHOW_VETO is on or off)
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

            // Show map grid on first veto render only (prevents animation reset)
            if (!mapGridInitialized) {
                mapGrid.style.display = 'flex';
                mapGridInitialized = true;
            }

            const teams = [data.teams.faction1, data.teams.faction2];
            const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
            
            // Sort teams for display (TacAM always left/home)
            if (tacamIndex === 1) teams.reverse();
            const [team1Data, team2Data] = teams;

            team1Display.textContent = team1Data.name;
            team2Display.textContent = team2Data.name;
            team1Logo.src = team1Data.avatar || 'https://via.placeholder.com/100?text=' + encodeURIComponent(team1Data.name);
            team2Logo.src = team2Data.avatar || '/logo_T_default.png';

            leagueDisplay.textContent = data.competition_name || "FACEIT Match";
            formatDisplay.textContent = `Best of ${data.best_of || '?'}`;

            if (!data.voting || !data.voting.map) {
                // No veto available - use status-based display
                updateStatusText(data);
                return;
            }

            const voting = data.voting.map;
            const entities = voting.entities;
            const picks = voting.pick || [];
            const bans = voting.drop || [];

            const totalActions = picks.length + bans.length;
            const totalMaps = entities.length;
            
            // Check if veto is complete (all maps except one are picked/banned)
            const vetoIsComplete = totalActions >= totalMaps - 1;
            
            // Hide timer if veto is complete and setting is enabled
            if (HIDE_TIMER_AFTER_VETO && vetoIsComplete) {
                if (!isVetoComplete) {
                    // First time veto is complete - hide timer
                    isVetoComplete = true;
                    timerDisplay.style.display = 'none';
                    actionDisplay.style.display = 'none';
                }
            } else {
                // Show timer if veto is not complete or setting is disabled
                if (isVetoComplete) {
                    // Veto was complete but now is not (shouldn't happen, but handle it)
                    isVetoComplete = false;
                    timerDisplay.style.display = 'block';
                    actionDisplay.style.display = 'block';
                }
                
                if (totalActions > lastVetoCount) {
                    lastVetoCount = totalActions;
                    // Only start/restart timer if no admin override is active
                    if (!hasTimerOverride && !timerInterval) {
                        // 3 minute timer on each new veto action
                        startTimer(180);
                    }
                }
            }

            // Create a map of existing visible cards for quick access
            const existingCards = new Map();
            Array.from(grid.children).forEach(card => {
                const mapName = card.querySelector('.map-name')?.textContent;
                const isVisible = parseFloat(window.getComputedStyle(card).opacity) > 0;
                if (mapName && isVisible) {
                    existingCards.set(mapName, card);
                }
            });

            // Count only visible maps for animation delay
            const visibleMapCount = Array.from(grid.children).filter(card => {
                return parseFloat(window.getComputedStyle(card).opacity) > 0;
            }).length;

            // Sort maps based on veto process and create veto order
            const bestOf = data.best_of || 1;
            
            // Define standard veto patterns based on best_of
            let vetoPattern = [];
            if (bestOf === 1) {
                // BO1: All banned except the last one which is DEFAULT
                vetoPattern = Array(totalMaps - 1).fill('BANNED').concat(['DEFAULT']);
            } else if (bestOf === 3) {
                // BO3: Ban, Ban, Pick, Pick, Ban, Ban, Decider
                vetoPattern = ['BAN', 'BAN', 'PICK', 'PICK', 'BAN', 'BAN', 'DECIDER'];
            } else if (bestOf === 5) {
                // BO5: Ban, Ban, Pick, Pick, Pick, Pick, Decider
                vetoPattern = ['BAN', 'BAN', 'PICK', 'PICK', 'PICK', 'PICK', 'DECIDER'];
            }
            
            // Categorize maps
            const bannedMaps = [];
            const pickedMaps = [];
            let deciderMap = null;
            
            entities.forEach((map) => {
                const mapId = map.guid || map.class_name;
                const isPicked = picks.includes(mapId);
                const isBanned = bans.includes(mapId);
                
                if (isBanned) {
                    bannedMaps.push(map);
                } else if (isPicked) {
                    pickedMaps.push(map);
                } else {
                    // Check if this could be the decider
                    if (picks.length + bans.length === totalMaps - 1) {
                        // Last remaining map is always the decider (BO1, BO3, BO5)
                        deciderMap = map;
                    } else if (bestOf === 1 && picks.length > 0) {
                        // For BO1: All non-picked maps (except decider) are implicitly banned
                        bannedMaps.push(map);
                    }
                }
            });
            
            // Sort picked maps in order they appear in picks array (veto order)
            pickedMaps.sort((a, b) => {
                const aId = a.guid || a.class_name;
                const bId = b.guid || b.class_name;
                return picks.indexOf(aId) - picks.indexOf(bId);
            });
            
            // Reconstruct map order based on veto pattern
            const finalMaps = [];
            let banIndex = 0;
            let pickIndex = 0;
            
            vetoPattern.forEach(action => {
                if ((action === 'BAN' || action === 'BANNED') && banIndex < bannedMaps.length) {
                    finalMaps.push(bannedMaps[banIndex++]);
                } else if ((action === 'PICK' || action === 'DEFAULT') && pickIndex < pickedMaps.length) {
                    finalMaps.push(pickedMaps[pickIndex++]);
                } else if (action === 'DECIDER' && deciderMap) {
                    finalMaps.push(deciderMap);
                }
            });

            let currentAnimationIndex = 0; // Counter for new maps

            finalMaps.forEach((map, index) => {
                const mapId = map.guid || map.class_name;
                const isPicked = picks.includes(mapId);
                const isBanned = (bestOf === 1 && !isPicked) || bans.includes(mapId);
                
                // Check if this is the decider map (BO3/BO5 only)
                const isDecider = bestOf > 1 && !isPicked && !isBanned && 
                                  (picks.length + bans.length === entities.length - 1);
                
                const mapKey = mapId;
                const existingCard = existingCards.get(map.name);
                
                // Check if this map already exists in the grid (even if not visible yet)
                const alreadyInGrid = Array.from(grid.children).some(card => 
                    card.querySelector('.map-name')?.textContent === map.name
                );
                
                if (existingCard) {
                    // Map is already visible - only update classes and label
                    existingCard.className = 'map-card';
                    if (isPicked) existingCard.classList.add('picked');
                    if (isBanned) existingCard.classList.add('banned');
                    if (isDecider) existingCard.classList.add('decider');
                    
                    // Update status label
                    const statusLabel = existingCard.querySelector('.status-label');
                    if (statusLabel) {
                        statusLabel.textContent = getStatusLabel(map, data, index);
                    }
                    
                    existingCards.delete(map.name); // Markiere als verarbeitet
                } else if (alreadyInGrid) {
                    // Map exists in DOM but is not visible yet (animation still running)
                    // Do nothing - animation continues
                } else {
                    // Create new map
                    const card = document.createElement('div');
                    card.className = 'map-card';
                    if (isPicked) card.classList.add('picked');
                    if (isBanned) card.classList.add('banned');
                    if (isDecider) card.classList.add('decider');
                    
                    // New map: Animate it with delay based on visible maps + new maps before it
                    card.style.animationDelay = `${(visibleMapCount + currentAnimationIndex) * 2}s`;
                    currentAnimationIndex++; // Increment for next new map
                    renderedMaps.add(mapKey);
                    
                    // Priority: 1. FACEIT image_lg, 2. Local images, 3. Placeholder
                    const mapImg = map.image_lg || getMapImage(map.name) || `https://via.placeholder.com/150x200?text=${map.name}`;

                    card.innerHTML = `
                        <img src="${mapImg}" alt="${map.name}" onerror="this.onerror=null; this.src='https://via.placeholder.com/150x200?text=${map.name}';">
                        <div class="status-label">${getStatusLabel(map, data, index)}</div>
                        <div class="map-name">${map.name}</div>
                    `;
                    grid.appendChild(card);
                }
            });

            // Remove maps that are no longer in the list (shouldn't happen, but just to be safe)
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
            team2Logo.src = team2Data.avatar || '/logo_T_default.png';
            
            leagueDisplay.textContent = data.competition_name || "FACEIT Match";
            formatDisplay.textContent = `Best of ${data.best_of || '?'}`;

            mapGrid.style.display = 'none';
            actionDisplay.textContent = "Stream starting soon...";

            // If no timer override is active, use FACEIT time
            // If manual timer is active, don't touch FACEIT timers
            if (!hasTimerOverride && data.scheduled_at) {
                const now = Math.floor(Date.now() / 1000);
                const diff = data.scheduled_at - now;
                if (diff > 0) {
                    // Only start timer if none is running
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
            // If hasTimerOverride is true, do nothing - let manual timer run
        }

        // Auto-detect which display team (left/right) starts the veto process
        function detectVetoStartSide(data, team1Data, team2Data) {
            // Skip if admin has manually set the veto start side
            if (hasManualVetoStartSide) {
                return; // Keep the manual override from admin
            }
            
            if (!data.teams || !data.teams.faction1 || !data.teams.faction2) {
                VETO_START_SIDE = 'left'; // Default
                return;
            }
            
            // In FACEIT, faction1 ALWAYS starts the veto process
            // We just need to determine if faction1 is displayed on the left or right
            const faction1 = data.teams.faction1;
            
            // Check if faction1 is the left display team (team1Data)
            if (faction1.faction_id === team1Data.faction_id) {
                VETO_START_SIDE = 'left';  // faction1 = left team -> left starts
            } else {
                VETO_START_SIDE = 'right'; // faction1 = right team -> right starts
            }
        }

        function getStatusLabel(map, data, vetoIndex) {
            const picks = data.voting.map.pick || [];
            const drops = data.voting.map.drop || [];
            const bestOf = data.best_of || 1;
            const mapId = map.guid || map.class_name;
            
            // BO1: Simple "BANNED" or "DEFAULT"
            if (bestOf === 1) {
                if (picks.includes(mapId)) {
                    return 'DEFAULT';
                } else {
                    return 'BANNED';
                }
            }
            
            // BO3/BO5: Show action type without team names
            if (picks.includes(mapId)) {
                return 'PICK';
            }
            
            if (drops.includes(mapId)) {
                return 'BAN';
            }
            
            // Check if this is the decider (remaining map)
            const totalVetoed = picks.length + drops.length;
            const totalMaps = data.voting.map.entities.length;
            
            if (totalVetoed === totalMaps - 1) {
                return 'DECIDER';
            }
            
            return "";
        }

        function showOutroView(data) {
            // Hide all UI elements except video and partner bar
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
                // Insert before partner bar
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
            
            // Get scores from results if available
            let team1Score = 0;
            let team2Score = 0;
            let winnerId = null;

            if (data.results && data.results.score) {
                const scores = data.results.score;
                
                // FACEIT uses "faction1" and "faction2" as keys, not the faction_id!
                // If teams were swapped, scores must also be swapped
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
                            <img src="${teams[0].avatar || '/logo_T_default.png'}" alt="${teams[0].name}">
                        </div>
                        <div class="outro-team-name outro-team-name-home">${teams[0].name}</div>
                        <div class="outro-team-score">${team1Score}</div>
                        ${winnerId === teams[0].faction_id ? '<div class="outro-winner-badge">WINNER</div>' : ''}
                    </div>

                    <div class="outro-vs">:</div>

                    <div class="outro-team">
                        <div class="outro-team-logo">
                            <img src="${teams[1].avatar || '/logo_T_default.png'}" alt="${teams[1].name}">
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

        // Update only action text without touching the timer (for manual timer mode)
        function updateActionTextOnly(data, now) {
            switch(data.status) {
                case 'FINISHED':
                    actionDisplay.textContent = "Match finished!";
                    break;
                case 'READY':
                    if (data.configured_at && data.configured_at > now - 600) {
                        actionDisplay.textContent = "Time to connect!";
                    } else {
                        actionDisplay.textContent = "Match is ready!";
                    }
                    break;
                case 'ONGOING':
                    actionDisplay.textContent = "Match is live!";
                    break;
                case 'CONFIGURING':
                    actionDisplay.textContent = "Setting lineup...";
                    break;
                case 'CHECKING_IN':
                    actionDisplay.textContent = "Check-in in progress...";
                    break;
                case 'CANCELLED':
                case 'ABORTED':
                    actionDisplay.textContent = "Match cancelled";
                    break;
                default:
                    if (data.scheduled_at && data.scheduled_at > now) {
                        actionDisplay.textContent = "Upcoming match";
                    } else if (data.voting && data.voting.map && data.voting.map.pick && data.voting.map.pick.length > 0) {
                        actionDisplay.textContent = "Veto finished!";
                    } else {
                        actionDisplay.textContent = "Stream starts in";
                    }
                    break;
            }
        }

        function updateStatusText(data) {
            const now = Math.floor(Date.now() / 1000);
            
            // If manual timer is active, don't reset it on status changes
            // Manual timer has absolute priority
            if (!hasTimerOverride) {
                // Reset timer on status change (except for manual override)
                // IMPORTANT: Don't reset renderedMaps to prevent re-animating maps
                if (lastMatchStatus !== null && lastMatchStatus !== data.status) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
            }
            lastMatchStatus = data.status;
            
            // Reset ONGOING flag wenn Status nicht ONGOING ist
            if (data.status !== 'ONGOING') {
                isOngoingTimerRunning = false;
            }
            
            // If manual timer is active, skip all automatic timer logic
            if (hasTimerOverride) {
                // Keep the action text updates but don't touch the timer
                updateActionTextOnly(data, now);
                return;
            }
            
            // FACEIT Status-Mapping (only when no manual timer)
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
                        // 2 minute timer for FACEIT delay (start only once)
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
                        // Timer nach Veto: Versuche FACEIT configured_at zu nutzen, sonst Fallback auf 3 Minuten
                        if (!hasTimerOverride && !timerInterval) {
                            if (data.configured_at && data.configured_at > now - 180) {
                                // Use FACEIT's configured_at for precise timer (3 minutes from configured_at)
                                const elapsed = now - data.configured_at;
                                const remaining = Math.max(0, 180 - elapsed);
                                if (remaining > 0) {
                                    startTimer(remaining);
                                }
                            } else {
                                // Fallback: Fixed 3-minute timer if no configured_at available
                                startTimer(180);
                            }
                        }
                    } else {
                        actionDisplay.textContent = "Stream starts in";
                    }
                    break;
            }
        }

        // App initialisieren (wird nach Config-Laden aufgerufen)
        function initApp() {
            fetchMatchData();
            setInterval(fetchMatchData, REFRESH_INTERVAL);
            
            // Check timer override frequently (every 500ms)
            // This ensures admin timer changes are reflected quickly
            setInterval(() => checkTimerOverride(null), 500);
            
            initBackgroundVideo();
            initPartners();
        }

        // Config laden und App starten
        loadConfig();