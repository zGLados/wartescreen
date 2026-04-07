# 🚀 Schnellstart-Anleitung

Diese Anleitung hilft dir, den FACEIT Wartescreen schnell zum Laufen zu bringen.

## ⚡ In 3 Minuten starten

### Schritt 1: Dependencies installieren

**Option A: Mit Docker 🐳 (empfohlen für Server)**

```bash
# Keine Installation nötig - nur Docker muss installiert sein!
```

**Option B: Mit Node.js (für lokale Entwicklung)**

Öffne ein Terminal im Projekt-Ordner und führe aus:

```bash
npm install
```

### Schritt 2: Konfiguration erstellen

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

**Mit Docker:**

```bash
docker-compose up -d
```

**Mit Node.js:**

```bash
npm start
```

Der Server läuft jetzt auf **http://localhost:3000**

## 🔑 Admin-Interface öffnen

Das Admin-Interface ist passwortgeschützt!

Beim ersten Aufruf von `http://localhost:3000/admin` wirst du nach Benutzername und Passwort gefragt:

- **Benutzername**: `admin` (oder dein ADMIN_USERNAME aus .env)
- **Passwort**: Das Passwort aus deiner `.env` Datei

⚠️ **WICHTIG**: Ändere das Passwort in der `.env` vor dem Production-Einsatz!

### 2. Match ID eingeben

Die Match ID findest du in der FACEIT Match Room URL:

```
https://www.faceit.com/de/cs2/room/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
                                    └──────────────────────┬──────────────────────┘
                                                    Das ist die Match ID
```

Kopiere nur den Teil: `1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`

### 3. Timer einstellen

- Klicke auf eine der Quick-Time-Buttons (z.B. "1min")
- Oder gib eine eigene Zeit in Sekunden ein
- Klicke "Timer starten"

### 4. Viewer öffnen

Der Viewer-Link wird automatisch generiert:
```
http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
```

Öffne diesen Link in:
- **OBS Browser Source** (empfohlen)
- Separatem Browser-Fenster
- Zweitem Monitor

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
