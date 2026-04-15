# 🐳 Docker Deployment Guide

This guide shows you how to run the FACEIT Waiting Screen with Docker.

## 📋 Prerequisites

- **Docker** installed (Version 20.10+)
- **Docker Compose** installed (Version 2.0+)

### Install Docker

**Windows/Mac:**
- Docker Desktop: https://www.docker.com/products/docker-desktop

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

## 🚀 Quick Start with Docker

### 1. Configure .env file

Edit the `.env` file and add your API key:

```env
FACEIT_API_KEY=your-api-key-here
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
SHOW_VETO=false
REFRESH_INTERVAL=5000
```

**Note**: All videos in the `videos/` folder and all partner logos in the `public/partners/` folder are automatically detected. No manual configuration needed!

**⚠️ Security**: The admin interface is protected by HTTP Basic Authentication. Make sure to change the password before production deployment!

### 2. Start container

```bash
docker-compose up -d
```

That's it! The server is now running on **http://localhost:3000**

### 3. View logs

```bash
docker-compose logs -f
```

### 4. Stop container

```bash
docker-compose down
```

## 🔧 Docker Commands

### Rebuild container (after code changes)

```bash
docker-compose up -d --build
```

### Check container status

```bash
docker-compose ps
```

### Access container shell

```bash
docker exec -it faceit-wartescreen sh
```

### Restart container

```bash
docker-compose restart
```

### Remove all containers and volumes

```bash
docker-compose down -v
```

## 📦 Manual Docker Build

If you want to work without docker-compose:

### Build image

```bash
docker build -t faceit-wartescreen .
```

### Start container

```bash
docker run -d \
  --name faceit-wartescreen \
  -p 3000:3000 \
  -e FACEIT_API_KEY="your-api-key" \
  -e SHOW_VETO=false \
  -v $(pwd)/videos:/app/videos:ro \
  -v $(pwd)/public/partners:/app/public/partners:ro \
  faceit-wartescreen
```

**Note**: Both `videos/` and `public/partners/` folders are mounted as read-only volumes.

### Stop container

```bash
docker stop faceit-wartescreen
docker rm faceit-wartescreen
```

## 🌍 Production Deployment

### With Reverse Proxy (Nginx)

**Extend docker-compose.yml**:

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

**nginx.conf** example:

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
    # ... existing config
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wartescreen.rule=Host(`yourserver.com`)"
      - "traefik.http.routers.wartescreen.entrypoints=websecure"
      - "traefik.http.routers.wartescreen.tls.certresolver=letsencrypt"
```

## 🔄 Performing Updates

### 1. Update code

```bash
git pull
```

### 2. Rebuild and restart container

```bash
docker-compose up -d --build
```

### 3. Clean up old images

```bash
docker image prune -f
```

## 💾 Update Videos and Partner Logos

Since videos and partner logos are mounted as volumes, you can simply update them in their respective folders:

### Add new videos

```bash
# Add new videos
cp new-videos/*.mp4 ./videos/

# Restart container
docker-compose restart
```

### Add partner logos

```bash
# Add new partner logos
cp partner-logos/*.png ./public/partners/

# Restart container
docker-compose restart
```

Videos and logos are automatically detected - no config changes needed!

## 🐛 Troubleshooting

### Port already in use

```bash
# Change port in .env
PORT=8080

# Restart container
docker-compose up -d
```

### Container won't start

```bash
# Check logs
docker-compose logs

# Check health status
docker inspect faceit-wartescreen | grep -A 10 Health
```

### Reset volumes

```bash
docker-compose down -v
docker-compose up -d
```

### Network issues

```bash
# Recreate network
docker-compose down
docker network prune
docker-compose up -d
```

### Partner logos not showing

```bash
# Verify volume mount
docker inspect faceit-wartescreen | grep -A 5 Mounts

# Check folder permissions
ls -la public/partners/

# Restart container
docker-compose restart
```

## 📊 Monitoring

### Monitor container resources

```bash
docker stats faceit-wartescreen
```

### Check health status

```bash
docker inspect --format='{{.State.Health.Status}}' faceit-wartescreen
```

### Save logs to file

```bash
docker-compose logs > logs.txt
```

## 🔒 Security

### Secrets Management

For production, you should use Docker Secrets:

**Modify docker-compose.yml**:

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

The container already runs as a non-root user (nodejs:1001) for better security.

### Read-Only Filesystem

For additional security:

```yaml
services:
  faceit-wartescreen:
    read_only: true
    tmpfs:
      - /tmp
```

## 📦 Multi-Platform Build

For ARM servers (e.g., Raspberry Pi):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t faceit-wartescreen .
```

## 🎯 Best Practices

1. **Always use .env for secrets** - never in code!
2. **Regular updates** - `docker-compose pull && docker-compose up -d`
3. **Rotate logs** - prevents full disks
4. **Use health checks** - automatic restart on issues
5. **Use volumes for videos and logos** - fast updates without rebuild
6. **Monitor resource usage** - ensure smooth operation
7. **Backup .env file** - keep credentials safe
8. **Use strong passwords** - especially for admin interface

## 📝 Volume Management

The application uses two main volumes:

### Videos Volume (`videos/`)
- Mounted as read-only (`:ro`)
- Auto-detected on container start
- Supports: .mp4, .webm, .ogg, .mov
- Random shuffle playback

### Partner Logos Volume (`public/partners/`)
- Mounted as read-only (`:ro`)
- Auto-detected on container start
- Supports: .png, .jpg, .jpeg, .gif, .svg
- Fallback to TacAM logo if empty

**Important**: After adding new files to these folders, restart the container with `docker-compose restart` to detect them.

---

**For questions: See [README.md](README.md) or create an issue!** 🚀
