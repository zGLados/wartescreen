# YouTube Playlist Setup

## ⚠️ Wichtig: Video Embedding Einstellungen

Damit die YouTube Videos im Hintergrund angezeigt werden können, müssen die Videos in der Playlist **"Embedding erlaubt"** haben.

### Problem: YouTube Error Code 150

**Error 150** bedeutet: "The owner of the requested video does not allow it to be played in embedded players."

### Lösung:

#### Option 1: Eigene Videos hochladen (empfohlen)
1. Lade deine Highlight-Videos auf **deinen eigenen YouTube-Channel** hoch
2. Bei jedem Video: **Einstellungen** → **Erweiterte Einstellungen** → **"Video in andere Websites einbetten" erlauben**
3. Erstelle eine Playlist mit diesen Videos
4. Verwende die Playlist-URL in der `.env`

#### Option 2: Öffentliche Videos verwenden
Nur Videos verwenden, die Embedding erlauben. Das kannst du testen:
1. Gehe zum Video auf YouTube
2. Klicke auf **"Teilen"** → **"Einbetten"**
3. Wenn ein Embed-Code angezeigt wird → ✅ Video kann eingebettet werden
4. Wenn Fehlermeldung erscheint → ❌ Video kann nicht eingebettet werden

#### Option 3: Kein Hintergrund-Video
Setze in der `.env`:
```env
YOUTUBE_PLAYLIST_URL=
```
Dann läuft die Seite ohne Hintergrund-Video (nur dunkler Hintergrund).

## Playlist URL Format

### Playlist:
```
https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxx
```

### Einzelnes Video:
```
https://www.youtube.com/watch?v=xxxxxxxxxxx
```

## Privacy-Einstellungen

Die Playlist kann sein:
- ✅ **Öffentlich** - funktioniert immer
- ✅ **Nicht gelistet** - funktioniert (Link wird benötigt)
- ❌ **Privat** - funktioniert NICHT

## Test

Nach dem Setup:
1. Öffne `https://deine-url.com/debug`
2. Klicke auf "YouTube API testen"
3. Wenn "YouTube Player Ready!" erscheint → ✅ Alles ok
4. Wenn "YouTube Error Code: 150" erscheint → ❌ Videos erlauben kein Embedding

## Beispiel-Setup

```env
# In .env Datei:
YOUTUBE_PLAYLIST_URL=https://www.youtube.com/playlist?list=PLxxxxxx

# Stelle sicher dass alle Videos in der Playlist:
# - Embedding erlauben
# - Öffentlich oder Nicht gelistet sind
```
