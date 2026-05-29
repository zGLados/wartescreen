# FACEIT Waiting Screen with Admin Control

Professional waiting screen for FACEIT CS2 matches with map veto display, countdown timer, match outro, and admin interface.

## 🚀 Features

- **Match-Specific URLs**: Each match has its own URL (`/1-{match-id}`)
- **Admin Interface**: Manual timer and veto control per match
- **Password Protection**: Secured by HTTP Basic Authentication
- **FACEIT API Integration**: Auto-fetch teams, veto, times, and results
- **PostgreSQL Integration**: 🆕 CS Demo Manager database support for enhanced player stats
- **Map Veto Animations**: Smooth 2s staggered ban/pick reveals
- **Match Outro**: Final scores, winner badge, and match summary
- **Partner Logos**: Display sponsor logos at bottom (auto-detected)
- **OBS-Ready Pages**: Technical break (`/pause.html`), clean screen (`/clean.html`), and BRB (`/brb.html`)
- **CS2 Map Images**: Local map previews for all active duty maps
- **Background Videos**: Random playback with shuffle logic
- **Live Updates**: Refreshes every 5 seconds
- **Smart Timer**: Auto countdown based on FACEIT status + manual override
- **Docker Support**: Easy deployment with Docker & Docker Compose
- **Auto-Cleanup**: Removes overrides older than 12 hours

## 📋 Prerequisites

**Option 1: Docker** 🐳 (recommended)
- Docker (20.10+)
- Docker Compose (2.0+)
- FACEIT API Key ([get one here](https://developers.faceit.com/))

**Option 2: Node.js**
- Node.js (14+)
- npm (comes with Node.js)
- FACEIT API Key

## 🔧 Quick Start

### With Docker 🐳

```bash
# 1. Create config
cp .env.example .env

# 2. Edit .env and add API key
nano .env

# 3. Start
docker-compose up -d
```

Server runs on **http://localhost:3000**

📖 More details: [DOCKER.md](DOCKER.md)

### With Node.js

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
nano .env  # Add your API key

# 3. Run
npm start  # Production
npm run dev  # Development with auto-reload
```

## ⚙️ Configuration

Edit `.env` file:

```env
# FACEIT API Key (required)
FACEIT_API_KEY=your-api-key-here

# Server Port
PORT=3000

# Admin Credentials (⚠️ Change in production!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Veto Display (can be overridden per match)
SHOW_VETO=false

# Refresh Interval (milliseconds)
REFRESH_INTERVAL=5000
```

### Adding Assets

**Videos**: Place `.mp4`, `.webm`, `.ogg`, or `.mov` files in `videos/` folder. Auto-detected!

**Partner Logos**: Place `.png`, `.jpg`, `.svg` files in `public/partners/` folder. Auto-detected! ([More info](public/partners/README.md))

**Map Images**: Already included in `public/maps/` for all active duty maps. ([More info](public/maps/README.md))

## 📺 Usage

### 1. Open Admin Interface

```
http://localhost:3000/admin
```

Login with credentials from `.env`

### 2. Enter Match ID

Format: `1-GUID` (from FACEIT match room URL)

Example: `1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`

### 3. Configure Settings

- **Timer Control**: Set custom duration or use presets
- **Veto Display**: Toggle map veto on/off per match
- **Reset**: Clear overrides to use FACEIT defaults

### 4. Use Viewer Link

Open generated link in OBS Browser Source:
```
http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
```

### 5. Match States

Viewer auto-adapts to match status:

- **Upcoming**: Countdown to start time
- **Check-in**: Check-in indicator
- **Configuring**: Lineup phase (3min timer)
- **Ready**: Time to connect (10min timer)
- **Ongoing**: Match live (2min stream delay)
- **Veto Phase**: Animated ban/pick display
- **Finished**: Outro with scores and winner

## 🎬 OBS Pages

Ready-to-use pages for OBS Browser Sources:

### Match Viewer
```
http://localhost:3000/1-{match-id}
```
Full match display with teams, timer, veto, and outro.

### Technical Break
```
http://localhost:3000/pause.html
```
Displays "TECHNICAL BREAK" message with animated spinner. Use for technical pauses or interruptions.

### Clean Screen
```
http://localhost:3000/clean.html
```
Only background video and partner logos. Perfect for transitions or as a placeholder scene.

### Be Right Back
```
http://localhost:3000/brb.html
```
Displays "BE RIGHT BACK" message. Use when taking short breaks during stream.

**OBS Setup**: Add as Browser Source (1920x1080), switch between scenes as needed.

## 📁 Project Structure

```
wartescreen/
├── public/                    # Static files
│   ├── css/                   # Stylesheets
│   ├── js/                    # JavaScript
│   ├── maps/                  # CS2 map images (see maps/README.md)
│   ├── partners/              # Partner logos (see partners/README.md)
│   ├── admin.html            # Admin interface
│   ├── viewer.html           # Match viewer
│   ├── pause.html            # Technical break screen (OBS)
│   ├── brb.html              # Be Right Back screen (OBS)
│   ├── clean.html            # Clean background screen (OBS)
│   └── index.html            # Landing page
├── videos/                    # Background videos (auto-detected)
├── server.js                  # Express server
├── .env                       # Configuration (not in Git!)
├── Dockerfile                 # Container definition
└── docker-compose.yml         # Docker orchestration
```

## 🔌 API Endpoints

### Config
- `GET /api/config/:matchId` - Get match config

### Timer Control
- `POST /api/timer/:matchId` - Set manual timer (`{ "duration": 60 }`)
- `GET /api/timer/:matchId` - Get timer status
- `DELETE /api/timer/:matchId` - Clear timer override

### Veto Control
- `POST /api/veto/:matchId` - Toggle veto display (`{ "showVeto": true }`)
- `GET /api/veto/:matchId` - Get veto setting
- `DELETE /api/veto/:matchId` - Reset to default

### Player Stats
- `GET /api/player-stats/:playerId` - Get player statistics
- `GET /api/player-stats` - Get all tracked players stats

## 🗄️ PostgreSQL Integration (CS Demo Manager)

**NEW!** This project now supports integration with [CS Demo Manager](https://cs-demo-manager.com/) PostgreSQL database for enhanced player statistics.

### Features
- **HLTV Rating 2.0** - Professional performance metrics
- **ADR** - Average Damage per Round
- **Advanced Stats** - Aces, 4Ks, Headshot %, KAST %, and more
- **Local Data** - No internet required once set up
- **All Demos** - Statistics from all analyzed demos, not just FACEIT matches

### Quick Setup

1. **Install dependencies** (includes `pg` PostgreSQL client):
   ```bash
   npm install
   ```

2. **Configure `.env`** with your PostgreSQL credentials:
   ```env
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DATABASE=csdm
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your-password
   USE_POSTGRES_STATS=true
   
   # Season Configuration (adjust for each new season)
   SEASON_START_DATE=2026-04-06
   PLAYOFF_START_DATE=2026-05-26
   ```

3. **Add Steam IDs** to `server.js`:
   ```javascript
   const TRACKED_PLAYERS = [
       { id: 'Aindrew', name: 'Aindrew', steamId: 'STEAM_ID_HERE' },
       // Add your players here...
   ];
   ```

4. **Restart server** and verify connection:
   ```
   [PostgreSQL] Connected to CS Demo Manager database
   ```

### Full Documentation

See **[POSTGRESQL.md](POSTGRESQL.md)** for complete setup instructions, database schema details, and troubleshooting.

### Data Sources

- **Player Statistics**: PostgreSQL (CS Demo Manager) only
- **Match Veto & Scheduling**: FACEIT API
- **Past Matches**: FACEIT API

## 🎨 Customization

### Colors

Edit `public/css/viewer.css`:

```css
:root {
    --bg-color: #0f1722;
    --accent-red: #c83737;
    --accent-blue: #122448;
    --ban-red: #ff4d4d;
    --pick-green: #2ecc71;
}
```

### Team Order

Edit `public/js/viewer.js` to change which team appears left:

```javascript
const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
```

### Animation Timing

Change map reveal delay in `public/js/viewer.js`:

```javascript
card.style.animationDelay = `${count * 2}s`;  // 2s per map
```

## 🐛 Troubleshooting

**Port in use**: Change `PORT` in `.env`

**No data**: Check API key and Match ID format

**Videos not playing**: Check formats (`.mp4`, `.webm`, `.ogg`, `.mov`) and browser autoplay settings

**Partner logos missing**: Check files are in `public/partners/` and restart server

**Outro not showing**: Only appears when match status is `FINISHED`

## 🌍 Production Deployment

### On Ubuntu Server

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Upload project
scp -r wartescreen/ user@server:/var/www/

# Install & run with PM2
cd /var/www/wartescreen
npm install
sudo npm install -g pm2
pm2 start server.js --name "faceit-wartescreen"
pm2 save
pm2 startup
```

### Nginx Reverse Proxy

Create `/etc/nginx/sites-available/wartescreen`:

```nginx
server {
    listen 80;
    server_name yourserver.com;

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

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/wartescreen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 🔄 Updates

```bash
# Pull changes
git pull

# With Docker
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# With Node.js
npm install
pm2 restart faceit-wartescreen
```

## 📝 License

MIT License - Free for personal and commercial use.

## 📧 Support

For questions or issues, create an issue on GitHub.

---

**Good luck with your stream! 🎮🔴**
