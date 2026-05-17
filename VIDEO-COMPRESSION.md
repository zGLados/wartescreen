# Video Compression System

## 📦 Übersicht

Das System komprimiert Videos automatisch beim Server-Start für optimale Streaming-Performance.

## 🎯 Funktionsweise

### Automatische Komprimierung
- **Beim Start**: Server prüft alle Videos in `/videos/`
- **Intelligentes Caching**: Komprimiert nur neue/geänderte Videos
- **Zielordner**: Komprimierte Videos → `/videos/processed/`
- **Fallback**: Verwendet Original-Videos wenn Komprimierung fehlschlägt

### Komprimierungseinstellungen
```javascript
Resolution:     1920x1080 (Full HD)
Video Bitrate:  2 Mbps
Audio Bitrate:  128 kbps
Codec:          H.264 (libx264)
CRF:            23 (gute Balance zwischen Qualität/Größe)
Preset:         medium (Balance zwischen Geschwindigkeit/Kompression)
```

### Erwartete Ergebnisse
- **Dateigrößen-Reduktion**: ~80-90% kleiner
- **Beispiel**: 754 MB → ~75-150 MB
- **Qualität**: Sehr gut, optimiert für Background-Videos

## 🚀 Verwendung

### Lokal (ohne Docker)

1. **FFmpeg installieren**
   - Windows: https://ffmpeg.org/download.html
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg`

2. **Videos manuell komprimieren**
   ```bash
   npm run compress-videos
   ```

3. **Server starten** (komprimiert automatisch)
   ```bash
   npm start
   ```

### Mit Docker

**Videos werden automatisch beim Container-Start komprimiert!**

```bash
# Container neu bauen und starten
npm run docker:build
npm run docker:up

# Logs ansehen
npm run docker:logs
```

## 📂 Verzeichnisstruktur

```
videos/
├── original-video-1.mp4       (Original-Datei)
├── original-video-2.mp4       (Original-Datei)
└── processed/                 (Automatisch erstellt)
    ├── original-video-1.mp4   (Komprimiert)
    └── original-video-2.mp4   (Komprimiert)
```

## 🔧 Konfiguration

Einstellungen anpassen in `scripts/compress-videos.js`:

```javascript
const FFMPEG_SETTINGS = {
    resolution: '1920x1080',    // Auflösung
    videoBitrate: '2M',         // Video-Bitrate (höher = besser/größer)
    audioBitrate: '128k',       // Audio-Bitrate
    preset: 'medium',           // Encoding-Geschwindigkeit
    crf: '23'                   // Qualität (18-28, niedriger = besser)
};
```

### Qualitätsstufen (CRF)
- **18**: Visuell verlustfrei (sehr groß)
- **23**: Empfohlen - gute Balance
- **28**: Niedriger Qualität (sehr klein)

### Encoding-Presets
- **ultrafast**: Schnellstes Encoding, größte Datei
- **fast**: Schnell, mittelgroß
- **medium**: ✅ Empfohlen - gute Balance
- **slow**: Langsam, beste Kompression
- **veryslow**: Sehr langsam, minimale Dateigröße

## ⚙️ Wie es funktioniert

1. **Server-Start**
   - Server startet
   - Ruft `compressAllVideos()` auf

2. **Intelligente Prüfung**
   - Prüft jede Datei in `/videos/`
   - Vergleicht Änderungsdatum: Original vs. Komprimiert
   - Überspringt bereits komprimierte Videos

3. **Komprimierung**
   - Verwendet FFmpeg mit optimierten Einstellungen
   - Speichert in `/videos/processed/`
   - Zeigt Fortschritt und Größenersparnis

4. **Server-Betrieb**
   - Bevorzugt komprimierte Videos
   - Fallback zu Original bei Fehler
   - Route: `/videos/filename.mp4` → automatisch richtige Version

## 🐛 Troubleshooting

### "FFmpeg not found"
```bash
# Windows
choco install ffmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt install ffmpeg
```

### Komprimierung zu langsam?
Ändere `preset` zu `fast` oder `ultrafast` in `compress-videos.js`

### Videos zu groß?
- Reduziere `videoBitrate` (z.B. auf `1M`)
- Erhöhe `crf` (z.B. auf `26`)
- Reduziere Auflösung zu `1280x720`

### Videos zu niedrige Qualität?
- Erhöhe `videoBitrate` (z.B. auf `3M`)
- Reduziere `crf` (z.B. auf `20`)

## 📊 Performance-Verbesserungen

### Vorher (Original-Videos)
- Dateigröße: 150-750 MB pro Video
- Ladezeit: 10-60 Sekunden
- Lag: Häufig

### Nachher (Komprimierte Videos)
- Dateigröße: 20-100 MB pro Video
- Ladezeit: 2-8 Sekunden
- Lag: Minimal bis keine

## 💡 Best Practices

1. **Originale behalten**: Komprimierte Videos in `/processed/`, Originale in `/videos/`
2. **Git Ignore**: Füge `/videos/processed/` zu `.gitignore` hinzu
3. **Erste Komprimierung**: Kann 5-30 Minuten dauern (je nach Anzahl/Größe)
4. **Nachfolgende Starts**: Nur neue Videos werden komprimiert (~sekunden)

## 🔄 Videos aktualisieren

1. Neue Videos in `/videos/` ablegen
2. Server neu starten
3. Nur neue Videos werden komprimiert
4. Automatisch in `/videos/processed/` verfügbar

## 📝 Logging

Server zeigt beim Start:
```
[Video Compression] Starting video compression...
[Video Compression] FFmpeg detected
[Video Compression] Found 9 video file(s)
[Video Compression] 3 video(s) need compression
[Video Compression] Compressing: video.mp4
[Video Compression] Original size: 754.56 MB
[Video Compression] ✓ video.mp4
[Video Compression]   → 98.23 MB (87.0% smaller)
[Video Compression]   → Took 45.23s
[Video Compression] Completed: 3/3 successful
[Server] Using 9 compressed video(s) from /videos/processed/
```
