# Eufy Camera System - Docker Setup

This guide explains how to run the Eufy Camera System using Docker containers.

## Prerequisites

- Docker and Docker Compose installed on your system
- Eufy Security credentials configured in `autoeufy-api/config.json`

## Important: Host Network Mode

This Docker setup uses `network_mode: host` for both services. This is **required** because:

- **UDP Broadcasting**: The Eufy security system uses UDP broadcasting for local device discovery
- **Local Discovery**: Without host networking, local discovery won't work and the system will fall back to cloud discovery
- **Performance**: Local discovery is faster and more reliable than cloud discovery
- **Device Communication**: Host mode allows direct communication with Eufy devices on your local network

**Note**: With host networking, the containers share the host's network stack, so ensure ports 8080 and 8081 are available on your host system.

## Quick Start

1. **Build and start the services:**
   ```bash
   docker-compose up -d
   ```

2. **Access the application:**
   - **UI**: http://localhost:8081
   - **API**: http://localhost:8080

3. **View logs:**
   ```bash
   # All services
   docker-compose logs -f
   
   # Specific service
   docker-compose logs -f eufy-api
   docker-compose logs -f eufy-ui
   ```

## Services

### Eufy API (`eufy-api`)
- **Port**: 8080
- **Image**: Node.js 18 Alpine
- **Network Mode**: Host (for UDP broadcasting)
- **Health Check**: `/health` endpoint
- **Volumes**:
  - `./autoeufy-api/database` → `/app/database` (persistent data)
  - `./autoeufy-api/persistent.json` → `/app/persistent.json` (Eufy session data)

### Eufy UI (`eufy-ui`)
- **Port**: 8081
- **Image**: Nginx Alpine
- **Network Mode**: Host
- **Health Check**: HTTP 200 response
- **Dependencies**: Waits for API to be healthy

## Configuration

### API Configuration
The API requires a `config.json` file in the `autoeufy-api/` directory with your Eufy credentials:

```json
{
  "username": "your-email@example.com",
  "password": "your-password",
  "country": "US"
}
```

### Environment Variables
You can customize the setup by creating a `.env` file:

```env
# API Configuration
NODE_ENV=production
API_PORT=8080

# UI Configuration
UI_PORT=80
```

## Data Persistence

The following data is persisted across container restarts:
- **Camera transition logs**: `./autoeufy-api/database/camera_transitions.csv`
- **Eufy session data**: `./autoeufy-api/persistent.json`

## Management Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### Restart services
```bash
docker-compose restart
```

### Rebuild and start
```bash
docker-compose up -d --build
```

### View service status
```bash
docker-compose ps
```

### Access container shell
```bash
# API container
docker-compose exec eufy-api sh

# UI container
docker-compose exec eufy-ui sh
```

## Troubleshooting

### Check service health
```bash
docker-compose ps
```

### View detailed logs
```bash
docker-compose logs eufy-api
docker-compose logs eufy-ui
```

### Restart specific service
```bash
docker-compose restart eufy-api
docker-compose restart eufy-ui
```

### Clean up and rebuild
```bash
# Stop and remove containers
docker-compose down

# Remove images and rebuild
docker-compose down --rmi all
docker-compose up -d --build
```

## Integration with Existing Docker Setup

If you have an existing Docker Compose setup, you can integrate these services by:

1. **Copy the service definitions** from `docker-compose.yml` to your existing file
2. **Adjust ports** if there are conflicts
3. **Add the network** to your existing services if needed
4. **Update volume paths** to match your project structure

### Example Integration
```yaml
# Add to your existing docker-compose.yml
services:
  # ... your existing services ...
  
  eufy-api:
    build:
      context: ./autoeufy-api
      dockerfile: Dockerfile
    container_name: eufy-api
    network_mode: host  # Required for UDP broadcasting
    volumes:
      - ./autoeufy-api/database:/app/database
      - ./autoeufy-api/persistent.json:/app/persistent.json
    environment:
      - NODE_ENV=production
    restart: unless-stopped

  eufy-ui:
    build:
      context: ./autoeufy-ui
      dockerfile: Dockerfile
    container_name: eufy-ui
    network_mode: host  # Required for UDP broadcasting
    depends_on:
      eufy-api:
        condition: service_healthy
    restart: unless-stopped

# Note: No networks section needed with host mode
# UI will be available on port 8081 to avoid conflicts
```

## Security Notes

- **Host Network Mode**: Both containers use `network_mode: host` to enable UDP broadcasting for local Eufy device discovery. This means the containers share the host's network stack.
- The UI runs on port 8081 (HTTP). For production, consider using HTTPS with a reverse proxy
- The API runs on port 8080. Consider firewall rules to restrict access
- Sensitive data (Eufy credentials) should be managed securely in production
- Consider using Docker secrets for sensitive configuration in production
- **Port Conflicts**: Ensure ports 8080 and 8081 are not used by other services on the host

## Performance

- The containers use Alpine Linux for smaller image sizes
- Nginx is configured with gzip compression for better performance
- Static assets are cached appropriately
- Health checks ensure services are monitored 