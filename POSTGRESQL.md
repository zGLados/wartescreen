# PostgreSQL Integration - CS Demo Manager

This project now supports integration with the **CS Demo Manager** PostgreSQL database to display detailed player statistics directly from your analyzed CS2 demos.

## Overview

With the PostgreSQL integration, you can access the following enhanced statistics:
- **HLTV Rating 2.0** - Professional performance rating metric
- **Average Damage per Round (ADR)** - Average damage dealt per round
- **K/D Ratio** - Kill/Death ratio across all matches
- **MVPs** - Number of MVP awards
- **Aces, 4Ks, 3Ks** - Multi-kill statistics
- **Headshot Percentage** - Percentage of kills that were headshots
- **KAST %** - Kill, Assist, Survived, or Traded percentage
- **First Kills/Deaths** - Opening duel statistics
- **Bomb Plants/Defuses** - Objective-based statistics

## Prerequisites

1. **CS Demo Manager** installed and configured
   - Download: https://cs-demo-manager.com/download
   - Documentation: https://cs-demo-manager.com/docs

2. **PostgreSQL Database** with analyzed demos
   - CS Demo Manager uses PostgreSQL by default to store demo analyses
   - The database should already exist if you're using CS Demo Manager

3. **Node.js** and **npm** installed

## Setup

### 1. Install Dependencies

```bash
npm install
```

The `pg` (PostgreSQL client) package will be installed automatically.

### 2. Find Players' Steam IDs

You need the **Steam ID 64** for your players. You can find it:

- In CS Demo Manager player details
- Via https://steamid.io/ (enter Steam profile URL)
- In the `steam_accounts` table in your PostgreSQL database

**Example Steam ID:** `76561198064695692`

### 3. Configure `.env` File

Copy `.env.example` to `.env`:

```bash
copy .env.example .env
```

Edit the `.env` file and add the following configuration:

```env
# PostgreSQL Database Configuration (CS Demo Manager)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=csdm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YourDatabasePassword

# Enable PostgreSQL Stats
USE_POSTGRES_STATS=true

# Season Configuration (adjust for each new season)
SEASON_START_DATE=2026-04-06
PLAYOFF_START_DATE=2026-05-26
```

**Important:** 
- Change `POSTGRES_PASSWORD` to your actual PostgreSQL password!
- Update `SEASON_START_DATE` and `PLAYOFF_START_DATE` for each new season to correctly split Regular Season and Playoffs statistics

### 4. Add Steam IDs in server.js

Open `server.js` and update the `TRACKED_PLAYERS` array with the correct Steam IDs:

```javascript
const TRACKED_PLAYERS = [
    { id: 'Aindrew', name: 'Aindrew', steamId: 'STEAM_ID_HERE' },
    { id: 'Fucs2i', name: 'Fucsii', steamId: 'STEAM_ID_HERE' },
    { id: 'cLn395', name: 'cLn', steamId: 'STEAM_ID_HERE' },
    { id: 'Bravo1911', name: 'Bravo', steamId: 'STEAM_ID_HERE' },
    { id: 'Henzzik', name: 'Henzzik', steamId: 'STEAM_ID_HERE' }
];
```

**Note:** Replace `STEAM_ID_HERE` with the actual Steam IDs of your players!

### 5. Start Server

```bash
npm start
```

If the connection is successful, you'll see:

```
[PostgreSQL] Connected to CS Demo Manager database
[Server] Running on http://localhost:3000
```

## Database Details

### Tables Used

The integration uses the following CS Demo Manager tables:

- **`players`** - Player statistics per match (main table)
- **`matches`** - Match information and results
- **`steam_accounts`** - Steam profiles and avatars (optional)

### Example Query

Here's a simplified example query that the integration uses:

```sql
SELECT 
    p.steam_id,
    p.name,
    COUNT(DISTINCT p.match_checksum) as match_count,
    SUM(p.kill_count) as total_kills,
    SUM(p.death_count) as total_deaths,
    SUM(p.mvp_count) as total_mvps,
    AVG(p.hltv_rating_2) as avg_rating2,
    AVG(p.average_damage_per_round) as avg_adr
FROM players p
WHERE p.steam_id = '76561198064695692'
GROUP BY p.steam_id, p.name;
```

## Data Sources

### PostgreSQL (CS Demo Manager)

Player-to-Watch statistics are now **exclusively** pulled from your local CS Demo Manager PostgreSQL database. This provides:

- ✅ **Comprehensive Statistics** - All stats from analyzed demos
- ✅ **Advanced Metrics** - HLTV Rating 2.0, ADR, KAST%, etc.
- ✅ **Offline Operation** - No internet required once configured
- ✅ **All Matches** - Statistics from all analyzed demos, not just FACEIT matches
- ✅ **Accurate Data** - Direct from demo files

### FACEIT API

The FACEIT API is still used for:
- Match veto information
- Match scheduling and timers
- Past matches display (match history)

**Note:** Player statistics are NO LONGER fetched from FACEIT. Only PostgreSQL is used for player stats.

## Troubleshooting

### Problem: "PostgreSQL Connection failed"

**Solution:**
1. Check if PostgreSQL is running:
   ```bash
   # Windows (check Services)
   services.msc
   # Or Task Manager → Services → postgresql-x64-*
   ```

2. Verify connection details in `.env`:
   - `POSTGRES_HOST` (default: `localhost`)
   - `POSTGRES_PORT` (default: `5432`)
   - `POSTGRES_DATABASE` (default: `csdm`)
   - `POSTGRES_USER` and `POSTGRES_PASSWORD`

3. Test the connection with `psql`:
   ```bash
   psql -h localhost -p 5432 -U postgres -d csdm
   ```

### Problem: "No stats found for Steam ID"

**Solution:**
1. Verify the Steam ID is correct
2. Check if demos for this player have been analyzed:
   ```sql
   SELECT COUNT(*) FROM players WHERE steam_id = '76561198064695692';
   ```
3. Analyze some demos in CS Demo Manager before proceeding

### Problem: "Steam ID not configured"

**Solution:**
1. Open `server.js`
2. Find the `TRACKED_PLAYERS` array
3. Replace `STEAM_ID_HERE` with actual Steam IDs
4. Restart the server

### Problem: Stats not updating

**Solution:**
1. Restart server (cache is refreshed on startup)
2. Wait 24 hours (automatic cache refresh)
3. Analyze new demos in CS Demo Manager

## API Endpoints

### GET `/api/player-stats/:playerId`

Returns statistics for a specific player.

**Example:**
```bash
curl http://localhost:3000/api/player-stats/Aindrew
```

**Response (PostgreSQL):**
```json
{
  "success": true,
  "data": {
    "player": {
      "player_id": "Aindrew",
      "nickname": "Aindrew"
    },
    "mvps": 15,
    "avgKills": "18.5",
    "winrate": 65,
    "kd": "1.23",
    "totalAces": 3,
    "total4k": 8,
    "avgRating2": "1.15",
    "avgAdr": "85.3",
    "avgHeadshotPct": "52.1",
    "source": "postgres"
  }
}
```

## Additional Information

- **CS Demo Manager Documentation:** https://cs-demo-manager.com/docs
- **CS Demo Manager GitHub:** https://github.com/akiver/cs-demo-manager
- **PostgreSQL Documentation:** https://www.postgresql.org/docs/

## License

MIT
