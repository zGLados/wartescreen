# FACEIT Waiting Screen with Admin Interface

Professional waiting screen for FACEIT CS2 matches with map veto display, animated countdown timer, match outro, and admin interface for manual control.

## 🚀 Features

- **🎯 Match-Specific URLs**: Each match has its own URL with the Match ID (e.g., `/1-{match-id}`)
- **🎛️ Admin Interface**: Manually control timer and veto display per match
- **🔒 Password Protection**: Admin interface secured by HTTP Basic Authentication
- **📊 FACEIT API Integration**: Automatic retrieval of team info, veto data, match times, and results
- **🎬 Map Veto Animations**: Smooth 2-second staggered animations for ban/pick reveals
- **🏆 Match Outro View**: Displays final scores, winner badge, and match summary when finished
- **🖼️ Partner Logo System**: Display sponsor/partner logos in bottom bar with automatic fallback
- **🗺️ CS2 Map Images**: Local map preview images for all active duty maps
- **🎥 Background Videos**: Random playback of highlight videos with shuffle logic
- **📱 Responsive Design**: Works on all screen sizes
- **🔄 Live Updates**: Timer, veto status, and match data update every 5 seconds
- **⏱️ Smart Timer Logic**: Automatic countdown based on FACEIT match status with manual override
- **🐳 Docker Support**: Easy deployment with Docker & Docker Compose
- **⚙️ Central Configuration**: All settings managed via `.env` file
- **🧹 Auto-Cleanup**: Automatic removal of timer overrides older than 12 hours

## 📋 Prerequisites

**Option 1: Local with Node.js**
- **Node.js** (Version 14 or higher)
- **npm** (comes with Node.js)
- **FACEIT API Key** (get one at https://developers.faceit.com/)

**Option 2: With Docker** 🐳 (recommended for servers)
- **Docker** (Version 20.10+)
- **Docker Compose** (Version 2.0+)
- **FACEIT API Key**

## 🔧 Installation

### Option 1: With Docker 🐳 (recommended)

```bash
# 1. Create .env file (copy from .env.example)
cp .env.example .env

# 2. Edit .env and add API Key
nano .env  # or another editor

# 3. Start container
docker-compose up -d
```

**Done!** The server runs on http://localhost:3000

📖 Detailed Docker guide: [DOCKER.md](DOCKER.md)

### Option 2: Local with Node.js

#### 1. Install dependencies

```bash
npm install
```

#### 2. Create configuration

```bash
# Create .env file
cp .env.example .env
```

Edit the `.env` file and add your values:

```env
FACEIT_API_KEY=your-api-key-here
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
SHOW_VETO=false
REFRESH_INTERVAL=5000
```

#### 3. Prepare videos and assets

- Place your highlight videos in the `videos/` folder (formats: .mp4, .webm, .ogg, .mov)
- Place partner logos in the `public/partners/` folder (automatic detection)
- CS2 map images are included in `public/maps/`

## 🎮 Starting the Server

### With Docker

```bash
docker-compose up -d
```

### With Node.js

#### Development mode (with auto-reload)

```bash
npm run dev
```

#### Production mode

```bash
npm start
```

The server runs on **Port 3000** by default.

## 📺 Usage

### 1. Open Admin Interface

Open in your browser:
```
http://localhost:3000/admin
```

or on your server:
```
https://yourserver.com/admin
```

**🔒 Login**: You will be prompted for username and password. Use the credentials from your `.env` file:
- Username: `admin` (default, customizable via `ADMIN_USERNAME`)
- Password: Your `ADMIN_PASSWORD` from `.env`

### 2. Enter Match ID

Enter the FACEIT Match ID (format: `1-GUID`). You can find the Match ID in the URL of the FACEIT match room.

Example: `1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6`

### 3. Configure Match Settings

- **Timer Control**: Select a preset time (30s, 1min, 2min, 5min, 10min, 15min) or enter a custom duration
- **Veto Display**: Toggle map veto display on/off for this specific match
- **Reset**: Clear timer override or veto settings to use FACEIT defaults

### 4. Use Viewer Link

The generated viewer link is displayed in the admin interface:
```
http://localhost:3000/1-3f08de52-b37e-462f-8d19-23ad0b6b7ab6
```

Open this link in OBS Browser Source or any browser for the viewer display.

### 5. Match States

The viewer automatically adapts to different match states:

- **Upcoming**: Countdown to match start time
- **Check-in**: Check-in progress indicator
- **Configuring**: Lineup selection phase (3min timer)
- **Ready**: Match ready, time to connect (10min timer)
- **Ongoing**: Match is live (2min delay timer for stream)
- **Veto Phase**: Animated display of map bans/picks (if enabled)
- **Finished**: Outro view with final scores and winner badge

## � Feature Details

### Map Veto System
- Automatically fetches veto data from FACEIT API
- Animated reveal with 2-second stagger per map
- Visual distinction between banned (red, grayscale) and picked (green, highlighted) maps
- Local CS2 map preview images with FACEIT image fallback
- Supports BO1, BO3, and BO5 formats
- Can be toggled on/off per match via admin interface

### Timer Intelligence
- **Automatic Mode**: Uses FACEIT match scheduled time and status
  - Upcoming matches: Countdown to start time
  - Check-in phase: Countdown to match start
  - Configuring phase: 3-minute lineup timer
  - Ready phase: 10-minute connection timer
  - Ongoing: 2-minute stream delay timer
- **Manual Override**: Admin can set custom timer per match
- **Smart Updates**: Prevents timer resets during API refresh cycles
- **Visual Indicator**: Shows when manual timer is active

### Match Outro View
- Automatically displays when match status is "FINISHED"
- Shows final scores for both teams
- Winner badge with green gradient highlight
- Displays played map name
- Team logos and names
- Background video continues playing
- Partner logos remain visible at bottom

### Partner Logo System
- Automatic detection of all images in `public/partners/` folder
- Supports multiple formats: PNG, JPG, SVG, GIF
- Responsive scrollable bar at bottom of screen
- Fallback to TacAM logo if no partner logos exist
- Logos maintain aspect ratio with max height constraint
- Hover animation for interactive feel

### Background Video System
- Random playback from `videos/` folder
- Shuffle logic prevents immediate repeats
- Auto-advance to next random video on end
- Supports multiple formats: MP4, WebM, OGG, MOV
- Reduced opacity (30%) for better text readability
- Works seamlessly in Docker with volume mounts

## �🌟 Server Deployment

### On a Linux Server (e.g. Ubuntu)

1. **Install Node.js**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Upload project**:
```bash
scp -r wartescreen/ user@server:/var/www/
```

3. **Install dependencies**:
```bash
cd /var/www/wartescreen
npm install
```

4. **Run permanently with PM2**:
```bash
sudo npm install -g pm2
pm2 start server.js --name "faceit-wartescreen"
pm2 save
pm2 startup
```

5. **Nginx Reverse Proxy** (optional):

Create Nginx config `/etc/nginx/sites-available/wartescreen`:

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

### Change Port

Set the environment variable `PORT`:

```bash
PORT=8080 npm start
```

or with PM2:
```bash
PORT=8080 pm2 start server.js --name "faceit-wartescreen"
```

## 📁 Project Structure

```
wartescreen/
├── public/                     # Static web files
│   ├── css/                    # Stylesheets
│   │   └── viewer.css         # Viewer styles
│   ├── js/                     # JavaScript files
│   │   └── viewer.js          # Viewer logic
│   ├── maps/                   # CS2 map preview images
│   │   ├── CS2_de_ancient.png
│   │   ├── CS2_de_anubis.png
│   │   ├── CS2_Dust_2_A_Site.jpg
│   │   ├── CS2_de_inferno.png
│   │   ├── CS2_de_mirage.png
│   │   ├── CS2_de_nuke.png
│   │   ├── CS2_de_overpass.png
│   │   └── CS2_de_vertigo.png
│   ├── partners/               # Partner/sponsor logos
│   │   └── TacAM_logo.png     # Fallback logo
│   ├── index.html             # Landing page
│   ├── admin.html             # Admin interface
│   └── viewer.html            # Match viewer (HTML structure only)
├── videos/                     # Highlight videos (auto-detected)
│   ├── video1.mp4
│   └── video2.mp4
├── server.js                   # Express server with API
├── package.json                # Node.js dependencies
├── .env                        # Configuration (not in Git!)
├── .env.example                # Config template
├── Dockerfile                  # Docker container definition
├── docker-compose.yml          # Docker orchestration
├── .dockerignore               # Docker build optimization
├── .gitignore                  # Git ignore rules
├── README.md                   # This file
├── SETUP.md                    # Quick start guide
└── DOCKER.md                   # Docker documentation
```

## 🔌 API Endpoints

### Get match configuration
```
GET /api/config/:matchId
```
Returns: API key, veto settings, video files, partner files, refresh interval

### Set timer override
```
POST /api/timer/:matchId
Body: { "duration": 60 }
```
Sets a manual timer override for the specified match (in seconds)

### Get timer status
```
GET /api/timer/:matchId
```
Returns: `{ "hasOverride": true/false, "remaining": seconds }`

### Clear timer override
```
DELETE /api/timer/:matchId
```
Removes the manual timer override, returning to FACEIT automatic timing

### Set veto display
```
POST /api/veto/:matchId
Body: { "showVeto": true }
```
Enable or disable veto display for this specific match

### Get veto setting
```
GET /api/veto/:matchId
```
Returns: `{ "showVeto": true/false }`

### Clear veto setting
```
DELETE /api/veto/:matchId
```
Resets veto setting to global default from `.env`

## 🔧 Technical Details

### Architecture
- **Backend**: Node.js with Express.js
- **Frontend**: Vanilla JavaScript (no frameworks)
- **API**: FACEIT Open API v4 with Bearer token authentication
- **Authentication**: HTTP Basic Auth for admin routes
- **Storage**: In-memory storage for timer/veto overrides (cleans up after 12 hours)
- **Polling**: Client-side polling every 5 seconds for live updates

### File Organization
- **Separation of Concerns**: HTML structure, CSS styling, and JavaScript logic in separate files
- **Modular CSS**: All styles in `public/css/viewer.css` with CSS variables for easy theming
- **Modular JavaScript**: Complete application logic in `public/js/viewer.js` (808 lines)
- **Lean HTML**: Only 47 lines of semantic HTML structure

### Performance Optimizations
- Browser caching for CSS and JavaScript files
- Efficient DOM updates (only update changed elements)
- Animation state tracking prevents re-animation on API updates
- Debounced timer logic prevents multiple concurrent intervals
- Automatic cleanup of stale data (12-hour retention)

### Security Features
- HTTP Basic Authentication for admin routes
- Environment-based credential management
- API key stored server-side only
- CORS protection
- Input validation for API endpoints

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ JavaScript features (async/await, arrow functions, template literals)
- CSS3 animations and flexbox
- HTML5 video element for background playback

## ⚙️ Configuration

All settings are managed via the `.env` file:

```env
# FACEIT API Key (required)
FACEIT_API_KEY=your-api-key-here

# Server Port
PORT=3000

# Admin Interface Credentials (⚠️ IMPORTANT: Change the password!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password

# Veto Display (true: show veto process; false: countdown only)
# Can be overridden per match via admin interface
SHOW_VETO=false

# Refresh Interval in milliseconds (default: 5000 = 5 seconds)
REFRESH_INTERVAL=5000
```

### Asset Management

**Videos**: All video files (.mp4, .webm, .ogg, .mov) in the `videos/` folder are automatically detected and used. No manual configuration needed!

**Partner Logos**: Place logo images in `public/partners/` folder. Supported formats: .png, .jpg, .jpeg, .gif, .svg. The system automatically detects and displays all logos. If no partner logos exist, it shows a fallback TacAM logo.

**Map Images**: CS2 map preview images are included in `public/maps/` for all active duty maps (Ancient, Anubis, Dust2, Inferno, Mirage, Nuke, Overpass, Vertigo).

**Security**: The admin interface is protected by HTTP Basic Authentication. Make sure to change the default password!

### Changing Settings

1. Edit the `.env` file
2. Restart the server:
   - **Docker**: `docker-compose restart`
   - **Node.js**: Stop with `Ctrl+C` and restart with `npm start`

### Adding Videos

1. Place videos in the `videos/` folder (supported formats: .mp4, .webm, .ogg, .mov)
2. Done! Videos are automatically detected
3. With Docker: Restart container with `docker-compose restart`

### Adding Partner Logos

1. Place logo images in `public/partners/` folder
2. Restart the server to detect new logos
3. With Docker: Make sure the folder is mounted (already configured in `docker-compose.yml`)

## 🎨 Customization

### Changing Colors

Edit `public/css/viewer.css` in the `:root` section:

```css
:root {
    --bg-color: #0f1722;       /* Background color */
    --accent-red: #c83737;     /* Primary color (Red) */
    --accent-blue: #122448;    /* Secondary color (Blue) */
    --ban-red: #ff4d4d;        /* Ban indicator color */
    --pick-green: #2ecc71;     /* Pick indicator color */
}
```

### Team Order

The viewer automatically sorts teams so that "TacAM" always appears on the left. To change this behavior, edit `public/js/viewer.js` and search for:

```javascript
const tacamIndex = teams.findIndex(t => t.name.toLowerCase().includes("tacam"));
```

### Animation Timing

Map veto animations are staggered with a 2-second delay per map. To adjust this, edit `public/js/viewer.js`:

```javascript
card.style.animationDelay = `${(visibleMapCount + currentAnimationIndex) * 2}s`;
// Change the '2' to your desired delay in seconds
```

## 🐛 Troubleshooting

### Server won't start
- Check if port 3000 is already in use: `netstat -ano | findstr :3000` (Windows) or `lsof -i :3000` (Linux/Mac)
- Verify Node.js installation: `node --version`
- Check `.env` file exists and contains valid values

### Viewer shows no data
- Verify the API key is correct in `.env`
- Check browser console (F12) for errors
- Ensure Match ID has correct format: `1-GUID`
- Verify FACEIT API is accessible (check network connection)

### Videos don't play
- Ensure videos are in the `videos/` folder
- Check video file formats (supported: .mp4, .webm, .ogg, .mov)
- Some browsers block autoplay - click play button once
- With Docker: Verify volume mount is correct in `docker-compose.yml`

### Timer keeps resetting
- This was a known issue that has been fixed - make sure you're using the latest version
- Timer should now count down smoothly without resets during API updates

### Veto animations repeat
- Fixed in recent updates - ensure you have the latest code
- Animations now show only once per map with proper 2-second staggering

### Partner logos not showing
- Verify logos are in `public/partners/` folder
- Check file formats (supported: .png, .jpg, .jpeg, .gif, .svg)
- With Docker: Ensure volume mount for partners folder exists

### Match outro not appearing
- Outro only displays when match status is "FINISHED"
- Verify FACEIT API returns correct match results
- Check browser console for JavaScript errors

## 🔄 Updates & Migrations

### Updating to latest version

```bash
# Pull latest changes
git pull origin main

# Install new dependencies (if any)
npm install

# With Docker
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Recent Breaking Changes

**v2.0 (File Structure Refactor)**: 
- CSS moved from inline to `public/css/viewer.css`
- JavaScript moved from inline to `public/js/viewer.js`
- Update required if you made custom modifications to viewer.html

## 📝 License

MIT License - Free to use for personal and commercial projects.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For questions or issues:
- Create an issue on GitHub
- Contact the developer

---

**Good luck with your stream! 🎮🔴**
