# FACEIT Wartescreen mit Admin-Interface

Professioneller Waiting Screen für FACEIT CS2 Matches mit Veto-Anzeige, Countdown-Timer und Admin-Interface zur manuellen Steuerung.

## 🚀 Features

- **URL-basiertes Routing**: Jedes Match hat eine eigene URL mit der Match ID
- **Admin-Interface**: Manuelles Steuern des Timers für jedes Match
- **🔒 Passwortschutz**: Admin-Interface durch Basic Authentication gesichert
- **FACEIT API Integration**: Automatisches Abrufen von Team-Infos, Veto-Daten und Match-Zeiten
- **Hintergrund-Videos**: Automatisches Abspielen von Highlight-Videos (automatische Erkennung)
- **Responsive Design**: Funktioniert auf allen Bildschirmgrößen
- **Live-Updates**: Timer und Veto-Status werden automatisch aktualisiert
- **🐳 Docker Support**: Einfaches Deployment mit Docker & Docker Compose
- **Zentrale Konfiguration**: Alle Einstellungen in einer `.env` Datei

## 📋 Voraussetzungen

**Option 1: Lokal mit Node.js**
- **Node.js** (Version 14 oder höher)
- **npm** (wird mit Node.js installiert)
- **FACEIT API Key** (erhältlich auf https://developers.faceit.com/)

**Option 2: Mit Docker** 🐳 (empfohlen für Server)
- **Docker** (Version 20.10+)
- **Docker Compose** (Version 2.0+)
- **FACEIT API Key**

## 🔧 Installation

### Option 1: Mit Docker 🐳 (empfohlen)

```bash
# 1. .env Datei erstellen (von .env.example kopieren)
cp .env.example .env

# 2. .env bearbeiten und API Key eintragen
nano .env  # oder ein anderer Editor

# 3. Container starten
docker-compose up -d
```

**Fertig!** Der Server läuft auf http://localhost:3000

📖 Ausführliche Docker-Anleitung: [DOCKER.md](DOCKER.md)

### Option 2: Lokal mit Node.js

#### 1. Abhängigkeiten installieren

```bash
npm install
```

#### 2. Konfiguration erstellen

```bash
# .env Datei erstellen
cp .env.example .env
```

Bearbeite die `.env` Datei und trage deine Werte ein:

```env
FACEIT_API_KEY=dein-api-key-hier
PORT=3000
VIDEO_FILES=video1.mp4,video2.mp4,video3.mp4
SHOW_VETO=false
REFRESH_INTERVAL=5000
```

#### 3. Videos vorbereiten

Lege deine Highlight-Videos im Ordner `Videos/` ab und trage die Dateinamen in der `.env` ein (kommagetrennt).

## 🎮 Server starten

### Mit Docker

```bash
docker-compose up -d
```

### Mit Node.js

#### Entwicklungsmodus (mit Auto-Reload)

```bash
npm run dev
```

### Produktionsmodus

```bash
npm start
```

Der Server läuft standardmäßig auf **Port 3000**.

## 📺 Verwendung

### 1. Admin-Interface öffnen

Öffne im Browser:
```
http://localhost:3000/admin
```

oder auf deinem Server:
```
https://deinserver.com/admin
```

**🔒 Login**: Du wirst nach Benutzername und Passwort gefragt. Verwende die Zugangsdaten aus deiner `.env` Datei:
- Benutzername: `admin` (Standard, anpassbar über `ADMIN_USERNAME`)
- Passwort: Dein `ADMIN_PASSWORD` aus der `.env`

### 2. Match ID eingeben

Gib die FACEIT Match ID ein (Format: `1-GUID`). Die Match ID findest du in der URL des FACEIT-Match-Rooms.

Beispiel: `1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`

### 3. Timer einstellen

- Wähle eine vordefinierte Zeit (30s, 1min, 2min, etc.)
- Oder gib eine eigene Zeit in Sekunden ein
- Klicke auf "Timer starten"

### 4. Viewer-Link verwenden

Der generierte Link wird im Admin-Interface angezeigt:
```
http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
```

Öffne diesen Link in OBS oder einem Browser für die Viewer-Ansicht.

## 🌐 Server-Deployment

### Auf einem Linux-Server (z.B. Ubuntu)

1. **Node.js installieren**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Projekt hochladen**:
```bash
scp -r wartescreen/ user@server:/var/www/
```

3. **Dependencies installieren**:
```bash
cd /var/www/wartescreen
npm install
```

4. **Mit PM2 dauerhaft laufen lassen**:
```bash
sudo npm install -g pm2
pm2 start server.js --name "faceit-wartescreen"
pm2 save
pm2 startup
```

5. **Nginx Reverse Proxy** (optional):

Erstelle eine Nginx-Config `/etc/nginx/sites-available/wartescreen`:

```nginx
server {
    listen 80;
    server_name deinserver.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/wartescreen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Port ändern

Setze die Umgebungsvariable `PORT`:

```bash
PORT=8080 npm start
```

oder in PM2:
```bash
PORT=8080 pm2 start server.js --name "faceit-wartescreen"
```

## 📁 Projektstruktur

```
wartescreen/
├── public/                  # Statische Webseiten
│   ├── index.html          # Startseite
│   ├── admin.html          # Admin-Interface
│   ├── viewer.html         # Match-Viewer
│   └── TacAM-logo.png      # Team-Logo
├── videos/                  # Highlight-Videos (automatisch geladen)
│   ├── video1.mp4
│   └── video2.mp4
├── server.js                # Express-Server mit API
├── package.json             # Node.js Dependencies
├── .env                     # Konfiguration (nicht in Git!)
├── .env.example             # Config-Template
├── Dockerfile               # Docker Container-Definition
├── docker-compose.yml       # Docker Orchestrierung
├── .dockerignore            # Docker Build-Optimierung
├── .gitignore               # Git-Ignore-Regeln
├── .editorconfig            # Editor-Einstellungen
├── README.md                # Diese Datei
├── SETUP.md                 # Schnellstart-Anleitung
└── DOCKER.md                # Docker-Dokumentation
```

## 🔌 API-Endpunkte

### Timer setzen
```
POST /api/timer/:matchId
Body: { "duration": 60 }
```

### Timer abrufen
```
GET /api/timer/:matchId
```

### Timer löschen
```
DELETE /api/timer/:matchId
```

## ⚙️ Konfiguration

Alle Einstellungen werden über die `.env` Datei verwaltet:

```env
# FACEIT API Key (erforderlich)
FACEIT_API_KEY=dein-api-key-hier

# Server Port
PORT=3000

# Admin-Interface Zugangsdaten (⚠️ WICHTIG: Ändere das Passwort!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dein-sicheres-passwort

# Veto-Anzeige aktivieren (true: Veto-Prozess anzeigen; false: Nur Countdown)
SHOW_VETO=false

# Refresh-Intervall in Millisekunden (Standard: 5000 = 5 Sekunden)
REFRESH_INTERVAL=5000
```

**Videos**: Alle Videodateien (.mp4, .webm, .ogg, .mov) im `videos/` Ordner werden automatisch erkannt und verwendet. Du musst sie nicht manuell konfigurieren!

**Sicherheit**: Das Admin-Interface ist durch HTTP Basic Authentication geschützt. Ändere unbedingt das Standardpasswort!

### Einstellungen ändern

1. Bearbeite die `.env` Datei
2. Starte den Server neu:
   - **Docker**: `docker-compose restart`
   - **Node.js**: Stoppe mit `Ctrl+C` und starte neu mit `npm start`

### Videos hinzufügen

1. Lege Videos im `videos/` Ordner ab (unterstützte Formate: .mp4, .webm, .ogg, .mov)
2. Fertig! Die Videos werden automatisch erkannt - kein Neustart nötig
3. Bei Docker: Container neu starten mit `docker-compose restart`

## 🎨 Anpassungen

### Farben ändern

In `public/viewer.html` und `public/admin.html` im `<style>`-Bereich:

```css
:root {
    --bg-color: #0f1722;       /* Hintergrundfarbe */
    --accent-red: #c83737;     /* Primärfarbe (Rot) */
    --accent-blue: #122448;    /* Sekundärfarbe (Blau) */
}
```

### Team-Reihenfolge

Die Viewer-Seite sortiert automatisch so, dass "TacAM" immer links erscheint. Um dies zu ändern, suche in `viewer.html` nach:

```javascript
const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
```

## 🐛 Troubleshooting

### Server startet nicht
- Prüfe ob Port 3000 bereits belegt ist: `netstat -ano | findstr :3000`
- Prüfe Node.js Installation: `node --version`

### Viewer zeigt keine Daten
- Prüfe ob der API Key korrekt ist
- Prüfe die Browser-Konsole (F12) auf Fehler
- Prüfe ob die Match ID das richtige Format hat

### Videos werden nicht abgespielt
- Prüfe ob die Videos im `Videos/`-Ordner liegen
- Prüfe ob die Dateinamen in `VIDEO_FILES` korrekt sind
- Manche Browser blockieren Autoplay - einmal den Play-Button drücken

## 📝 Lizenz

MIT License - Frei verwendbar für persönliche und kommerzielle Projekte.

## 🤝 Support

Bei Fragen oder Problemen erstelle ein Issue oder kontaktiere den Entwickler.

---

**Viel Erfolg mit deinem Stream! 🎮🔴**
