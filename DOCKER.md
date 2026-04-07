# 🐳 Docker Deployment Guide

Diese Anleitung zeigt dir, wie du den FACEIT Wartescreen mit Docker betreibst.

## 📋 Voraussetzungen

- **Docker** installiert (Version 20.10+)
- **Docker Compose** installiert (Version 2.0+)

### Docker installieren

**Windows/Mac:**
- Docker Desktop: https://www.docker.com/products/docker-desktop

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

## 🚀 Schnellstart mit Docker

### 1. .env Datei konfigurieren

Bearbeite die `.env` Datei und trage deinen API Key ein:

```env
FACEIT_API_KEY=dein-api-key-hier
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dein-sicheres-passwort
SHOW_VETO=false
REFRESH_INTERVAL=5000
```

**Hinweis**: Alle Videos im `videos/` Ordner werden automatisch erkannt. Du musst keine Video-Liste mehr pflegen!

**⚠️ Sicherheit**: Das Admin-Interface ist durch HTTP Basic Authentication geschützt. Ändere unbedingt das Passwort vor dem Production-Deployment!

### 2. Container starten

```bash
docker-compose up -d
```

Das war's! Der Server läuft jetzt auf **http://localhost:3000**

### 3. Logs anschauen

```bash
docker-compose logs -f
```

### 4. Container stoppen

```bash
docker-compose down
```

## 🔧 Docker-Befehle

### Container neu bauen (nach Code-Änderungen)

```bash
docker-compose up -d --build
```

### Container Status prüfen

```bash
docker-compose ps
```

### In Container einloggen

```bash
docker exec -it faceit-wartescreen sh
```

### Container neu starten

```bash
docker-compose restart
```

### Alle Container und Volumes löschen

```bash
docker-compose down -v
```

## 📦 Manueller Docker Build

Wenn du ohne docker-compose arbeiten möchtest:

### Image bauen

```bash
docker build -t faceit-wartescreen .
```

### Container starten

```bash
docker run -d \
  --name faceit-wartescreen \
  -p 3000:3000 \
  -e FACEIT_API_KEY="dein-api-key" \
  -e SHOW_VETO=false \
  -v $(pwd)/Videos:/app/Videos:ro \
  faceit-wartescreen
```

### Container stoppen

```bash
docker stop faceit-wartescreen
docker rm faceit-wartescreen
```

## 🌍 Production Deployment

### Mit Reverse Proxy (Nginx)

**docker-compose.yml** erweitern:

```yaml
services:
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - faceit-wartescreen
    networks:
      - wartescreen-network

  faceit-wartescreen:
    # ... existing config
    expose:
      - "3000"
    # Remove ports section when using nginx
```

**nginx.conf** Beispiel:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream wartescreen {
        server faceit-wartescreen:3000;
    }

    server {
        listen 80;
        server_name deinserver.com;

        location / {
            proxy_pass http://wartescreen;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
```

### Mit Traefik

```yaml
services:
  faceit-wartescreen:
    # ... existing config
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wartescreen.rule=Host(`deinserver.com`)"
      - "traefik.http.routers.wartescreen.entrypoints=websecure"
      - "traefik.http.routers.wartescreen.tls.certresolver=letsencrypt"
```

## 🔄 Updates durchführen

### 1. Code aktualisieren

```bash
git pull
```

### 2. Container neu bauen und starten

```bash
docker-compose up -d --build
```

### 3. Alte Images aufräumen

```bash
docker image prune -f
```

## 💾 Videos aktualisieren

Da die Videos als Volume gemountet sind, kannst du sie einfach im `videos/` Ordner aktualisieren:

```bash
# Neue Videos hinzufügen
cp neue-videos/*.mp4 ./videos/

# Container neu starten
docker-compose restart
```

Die Videos werden automatisch erkannt - keine Config-Änderungen nötig!

## 🐛 Troubleshooting

### Port bereits belegt

```bash
# Port in .env ändern
PORT=8080

# Container neu starten
docker-compose up -d
```

### Container startet nicht

```bash
# Logs prüfen
docker-compose logs

# Health Check prüfen
docker inspect faceit-wartescreen | grep -A 10 Health
```

### Volumes zurücksetzen

```bash
docker-compose down -v
docker-compose up -d
```

### Netzwerk-Probleme

```bash
# Netzwerk neu erstellen
docker-compose down
docker network prune
docker-compose up -d
```

## 📊 Monitoring

### Container-Ressourcen überwachen

```bash
docker stats faceit-wartescreen
```

### Health Status prüfen

```bash
docker inspect --format='{{.State.Health.Status}}' faceit-wartescreen
```

### Logs in Datei speichern

```bash
docker-compose logs > logs.txt
```

## 🔒 Sicherheit

### Secrets Management

Für Production solltest du Docker Secrets nutzen:

**docker-compose.yml** anpassen:

```yaml
services:
  faceit-wartescreen:
    secrets:
      - faceit_api_key
    environment:
      - FACEIT_API_KEY_FILE=/run/secrets/faceit_api_key

secrets:
  faceit_api_key:
    file: ./secrets/api_key.txt
```

### Non-Root User

Der Container läuft bereits als non-root User (nodejs:1001) für bessere Sicherheit.

### Read-Only Filesystem

Für zusätzliche Sicherheit:

```yaml
services:
  faceit-wartescreen:
    read_only: true
    tmpfs:
      - /tmp
```

## 📦 Multi-Platform Build

Für ARM-Server (z.B. Raspberry Pi):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t faceit-wartescreen .
```

## 🎯 Best Practices

1. **Immer .env für Secrets nutzen** - nie im Code!
2. **Regelmäßige Updates** - `docker-compose pull && docker-compose up -d`
3. **Logs rotieren** - verhindert volle Festplatten
4. **Health Checks nutzen** - automatisches Neustart bei Problemen
5. **Volumes für Videos** - schnelle Updates ohne Rebuild

---

**Bei Fragen: Siehe [README.md](README.md) oder erstelle ein Issue!** 🚀
