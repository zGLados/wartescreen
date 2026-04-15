# 🚀 Quick Start Guide

This guide helps you get the FACEIT Waiting Screen up and running quickly.

## ⚡ Get Started in 3 Minutes

### Step 1: Install Dependencies

**Option A: With Docker 🐳 (recommended for servers)**

```bash
# No installation needed - only Docker must be installed!
```

**Option B: With Node.js (for local development)**

Open a terminal in the project folder and run:

```bash
npm install
```

### Step 2: Create Configuration

```bash
# .env Datei aus Vorlage erstellen
cp .env.example .env
```

Bearbeite die `.env` Datei und trage deinen FACEIT API Key ein:

```env
FACEIT_API_KEY=dein-api-key-hier
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dein-sicheres-passwort
SHOW_VETO=false
REFRESH_INTERVAL=5000
```

> **Tipp**: Deinen API Key findest du auf https://developers.faceit.com/
> **Videos**: Lege einfach .mp4/.webm/.ogg/.mov Dateien in den `videos/` Ordner - sie werden automatisch erkannt!
> **⚠️ Sicherheit**: Ändere unbedingt das Admin-Passwort!

### Schritt 3: Server starten

**With Docker:**

```bash
docker-compose up -d
```

**With Node.js:**

```bash
npm start
```

The server now runs on **http://localhost:3000**

## 🔑 Open Admin Interface

The admin interface is password protected!

When first accessing `http://localhost:3000/admin` you will be asked for username and password:

- **Username**: `admin` (or your ADMIN_USERNAME from .env)
- **Password**: The password from your `.env` file

⚠️ **IMPORTANT**: Change the password in `.env` before production use!

### 2. Enter Match ID

Find the Match ID in the FACEIT Match Room URL:

```
https://www.faceit.com/en/cs2/room/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
                                    └──────────────────────┬──────────────────────┘
                                                    This is the Match ID
```

Copy only this part: `1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`

### 3. Set Timer

- Click one of the Quick Time buttons (e.g. "1min")
- Or enter a custom time in seconds
- Click "Start Timer"

### 4. Open Viewer

The viewer link is automatically generated:
```
http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
```

Open this link in:
- **OBS Browser Source** (recommended)
- Separate browser window
- Second monitor

## 🎬 In OBS einbinden

1. **Browser Source hinzufügen**
   - Rechtsklick in "Quellen" → "Browser" hinzufügen

2. **URL eingeben**
   ```
   http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
   ```

3. **Größe einstellen**
   - Breite: 1920
   - Höhe: 1080
   - (oder deine Stream-Auflösung)

4. **Fertig!**
   - Der Screen aktualisiert sich automatisch
   - Timer läuft synchron
   - Videos spielen im Hintergrund ab

## 🎨 Videos hinzufügen

1. Lege deine `.mp4`, `.webm`, `.ogg` oder `.mov` Highlight-Videos in den `videos/` Ordner

2. Fertig! Videos werden automatisch erkannt und im Loop abgespielt.

3. Wenn du während des Betriebs Videos hinzufügst:
   - **Docker**: `docker-compose restart`
   - **Node.js**: Seite im Browser neu laden (F5)

## 🔄 Timer während des Streams anpassen

Du kannst den Timer **jederzeit** anpassen:

1. Gehe zu `http://localhost:3000/admin`
2. Gib die Match ID ein (falls noch nicht)
3. Setze neue Zeit
4. Klicke "Timer starten"
5. **Viewer aktualisiert sich automatisch** - kein Reload nötig!

**🎯 Intelligente Timer-Logik:**
- ⏰ **Match in der Zukunft?** → FACEIT Countdown läuft zuerst (bis Match-Start)
- ✅ **Match gestartet?** → Dein manueller Timer wird aktiv
- 💡 **Tipp**: Timer kann vorab gesetzt werden - er aktiviert sich automatisch zur richtigen Zeit!

## ⚙️ Veto-Anzeige aktivieren

Wenn du den Veto-Prozess anzeigen möchtest statt nur einem Countdown:

Bearbeite die `.env` Datei und ändere:

```env
SHOW_VETO=true  # Vorher: false
```

Starte den Server neu:
- **Docker**: `docker-compose restart`
- **Node.js**: `Ctrl+C` und dann `npm start`

Jetzt werden die Map-Picks und Bans des Veto-Prozesses angezeigt!

## 🌍 Für andere freigeben (im lokalen Netzwerk)

Andere können den Stream über deine lokale IP sehen:

1. Finde deine IP:
   - **Windows**: `ipconfig` → "IPv4-Adresse"
   - **Mac/Linux**: `ifconfig` → "inet"

2. Teile die URL:
   ```
   http://192.168.1.XXX:3000/admin
   http://192.168.1.XXX:3000/1-match-id-hier
   ```

## 🆘 Hilfe bei Problemen

### "npm: Befehl nicht gefunden"
→ Node.js ist nicht installiert. Download: https://nodejs.org/

### "Port 3000 already in use"
→ Port ist belegt. Nutze einen anderen:
```bash
PORT=8080 npm start
```

### Videos spielen nicht ab
→ Browser blockiert Autoplay. Einmal manuell Play drücken.

### Timer synchronisiert nicht
→ Prüfe die Browser-Konsole (F12) auf Fehler
→ Prüfe ob der Server läuft

## 📞 Noch Fragen?

Schau in die ausführliche [README.md](README.md) oder öffne ein Issue!

---

**Viel Erfolg! 🎮**
