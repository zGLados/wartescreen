const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Funktion zum automatischen Scannen aller Videos
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

// Funktion zum automatischen Scannen aller Partner-Bilder
function getPartnerFiles() {
    const partnersDir = path.join(__dirname, 'partners');
    try {
        if (!fs.existsSync(partnersDir)) {
            console.warn('Partners directory not found');
            return [];
        }
        const files = fs.readdirSync(partnersDir);
        return files.filter(file => {
            // Nur Bild-Dateien
            if (!/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)) {
                return false;
            }
            // TacAM Fallback-Logo ausschließen
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

// Middleware für JSON und statische Dateien
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/partners', express.static(path.join(__dirname, 'partners')));

// In-Memory-Speicher für Timer-Overrides (später kann das in eine DB ausgelagert werden)
const timerOverrides = {};

// In-Memory-Speicher für Veto-Overrides pro Match
const vetoOverrides = {};

// Middleware für Basic Authentication (nur für Admin-Seiten)
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

// API-Endpunkt: Config abrufen (für Client)
app.get('/api/config', (req, res) => {
    res.json({
        apiKey: process.env.FACEIT_API_KEY || '',
        videoFiles: getVideoFiles(),
        partnerFiles: getPartnerFiles(),
        showVeto: process.env.SHOW_VETO === 'true',
        refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000
    });
});

// API-Endpunkt: Config mit Match-spezifischer Veto-Einstellung abrufen
app.get('/api/config/:matchId', (req, res) => {
    const { matchId } = req.params;
    const baseShowVeto = process.env.SHOW_VETO === 'true';
    const showVeto = vetoOverrides[matchId] !== undefined ? vetoOverrides[matchId] : baseShowVeto;
    
    res.json({
        apiKey: process.env.FACEIT_API_KEY || '',
        videoFiles: getVideoFiles(),
        partnerFiles: getPartnerFiles(),
        showVeto: showVeto,
        refreshInterval: parseInt(process.env.REFRESH_INTERVAL) || 5000
    });
});

// API-Endpunkt: Veto-Einstellung setzen (geschützt)
app.post('/api/veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    const { showVeto } = req.body;
    
    if (showVeto === undefined) {
        return res.status(400).json({ error: 'Missing showVeto parameter' });
    }
    
    vetoOverrides[matchId] = Boolean(showVeto);
    res.json({ success: true, matchId, showVeto: vetoOverrides[matchId] });
});

// API-Endpunkt: Veto-Einstellung abrufen
app.get('/api/veto/:matchId', (req, res) => {
    const { matchId } = req.params;
    const baseShowVeto = process.env.SHOW_VETO === 'true';
    const showVeto = vetoOverrides[matchId] !== undefined ? vetoOverrides[matchId] : baseShowVeto;
    
    res.json({
        showVeto: showVeto,
        isOverride: vetoOverrides[matchId] !== undefined
    });
});

// API-Endpunkt: Veto-Einstellung zurücksetzen (geschützt)
app.delete('/api/veto/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    delete vetoOverrides[matchId];
    res.json({ success: true });
});

// API-Endpunkt: Timer-Override setzen (geschützt)
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
    
    res.json({ success: true, matchId, duration: parseInt(duration) });
});

// API-Endpunkt: Timer-Override abrufen
app.get('/api/timer/:matchId', (req, res) => {
    const { matchId } = req.params;
    const override = timerOverrides[matchId];
    
    if (!override) {
        return res.json({ hasOverride: false });
    }
    
    // Berechne verbleibende Zeit
    const elapsed = Math.floor((Date.now() - override.timestamp) / 1000);
    const remaining = Math.max(0, override.duration - elapsed);
    
    res.json({
        hasOverride: true,
        originalDuration: override.duration,
        remaining: remaining,
        timestamp: override.timestamp
    });
});

// API-Endpunkt: Timer-Override löschen (geschützt)
app.delete('/api/timer/:matchId', requireAuth, (req, res) => {
    const { matchId } = req.params;
    delete timerOverrides[matchId];
    res.json({ success: true });
});

// Admin-Interface (geschützt)
app.get('/admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Route für Viewer-Seiten (Match ID als URL-Parameter)
app.get('/:matchId', (req, res) => {
    const { matchId } = req.params;
    
    // Prüfe ob es eine Match ID ist (FACEIT Format: 1-GUID)
    if (matchId.match(/^1-[a-f0-9-]+$/i)) {
        res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
    } else {
        res.status(404).send('Invalid Match ID');
    }
});

// Fallback zur Startseite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Admin-Interface: http://localhost:${PORT}/admin`);
    console.log(`Viewer-Beispiel: http://localhost:${PORT}/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`);
});
