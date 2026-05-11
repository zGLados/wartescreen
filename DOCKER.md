# 🐳 Docker Deployment Guide

Run the FACEIT Waiting Screen with Docker.

## 📋 Prerequisites

- **Docker** (20.10+)
- **Docker Compose** (2.0+)

### Install Docker

**Windows/Mac**: [Docker Desktop](https://www.docker.com/products/docker-desktop)

**Linux**:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

## 🚀 Quick Start

### 1. Configure

```bash
cp .env.example .env
nano .env  # Add API key and credentials
```

**Note**: All videos in `videos/` and partner logos in `public/partners/` are auto-detected!

### 2. Start

```bash
docker-compose up -d
```

Server runs on **http://localhost:3000**

### 3. View Logs

```bash
docker-compose logs -f
```

### 4. Stop

```bash
docker-compose down
```

## 🔧 Docker Commands

### Rebuild (after code changes)

```bash
docker-compose up -d --build
```

### Check Status

```bash
docker-compose ps
```

### Container Shell

```bash
docker exec -it faceit-wartescreen sh
```

### Restart

```bash
docker-compose restart
```

### Remove All

```bash
docker-compose down -v
```

## 📦 Manual Docker Build

Without docker-compose:

```bash
# Build
docker build -t faceit-wartescreen .

# Run
docker run -d \
  --name faceit-wartescreen \
  -p 3000:3000 \
  -e FACEIT_API_KEY="your-api-key" \
  -v $(pwd)/videos:/app/videos:ro \
  -v $(pwd)/public/partners:/app/public/partners:ro \
  faceit-wartescreen

# Stop
docker stop faceit-wartescreen
docker rm faceit-wartescreen
```

## 🌍 Production Deployment

### With Nginx

**nginx.conf**:

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
        server_name yourserver.com;

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

### With Traefik

```yaml
services:
  faceit-wartescreen:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wartescreen.rule=Host(`yourserver.com`)"
      - "traefik.http.routers.wartescreen.entrypoints=websecure"
      - "traefik.http.routers.wartescreen.tls.certresolver=letsencrypt"
```

## 🔄 Updates

```bash
# Pull changes
git pull

# Rebuild
docker-compose up -d --build

# Clean up
docker image prune -f
```

## 💾 Update Assets

### Videos

```bash
cp new-videos/*.mp4 ./videos/
docker-compose restart
```

### Partner Logos

```bash
cp logos/*.png ./public/partners/
docker-compose restart
```

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Change port in .env
PORT=8080

# Restart
docker-compose up -d
```

### Check Health

```bash
docker inspect faceit-wartescreen | grep -A 10 Health
```

### Reset Volumes

```bash
docker-compose down -v
docker-compose up -d
```

### Partner Logos Not Showing

```bash
# Verify mount
docker inspect faceit-wartescreen | grep -A 5 Mounts

# Check permissions
ls -la public/partners/

# Restart
docker-compose restart
```

## 📊 Monitoring

```bash
# Resource usage
docker stats faceit-wartescreen

# Health status
docker inspect --format='{{.State.Health.Status}}' faceit-wartescreen

# Save logs
docker-compose logs > logs.txt
```

## 🔒 Security

### Docker Secrets

**docker-compose.yml**:

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

### Read-Only Filesystem

```yaml
services:
  faceit-wartescreen:
    read_only: true
    tmpfs:
      - /tmp
```

## 🎯 Best Practices

1. **Use .env for secrets** - never in code!
2. **Regular updates** - `docker-compose pull && docker-compose up -d`
3. **Monitor resources** - ensure smooth operation
4. **Use volumes** - fast updates without rebuild
5. **Strong passwords** - especially for admin interface

## 📝 Volume Management

The application uses two volumes:

- **Videos** (`videos/`) - Auto-detected, random shuffle
- **Partner Logos** (`public/partners/`) - Auto-detected, displayed at bottom

After adding files, restart: `docker-compose restart`

---

**For more info: See [README.md](README.md)** 🚀
