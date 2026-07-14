# MVA-MW-Tool

Middleware Administration Console — a professional admin tool for managing builds, deployments, and repository operations across Azure DevOps and GitHub.

## Prerequisites

- **Docker Desktop** or **Docker Engine + Docker Compose**

### For local development only

- **Java 21** (for backend)
- **Maven 3.8+** (for backend)
- **Node.js 22+** (for frontend)
- **Angular CLI** (`npm install -g @angular/cli`)

## Project Structure

```
mva-mw-tool/
├── backend/          # Spring Boot 3.3.x REST API (Java 21)
├── frontend/         # Angular 22 + Angular Material UI
├── docker-compose.yml
└── README.md
```

## Run With Docker

Start the full app from the project root:

```bash
docker compose up --build
```

This starts:

- **Frontend** on `http://localhost:4200`
- **Backend API** on `http://localhost:8080`

The frontend container serves the Angular app with Nginx and proxies all `/api` requests to the backend container, so no extra frontend API configuration is needed.

### Stop the containers

```bash
docker compose down
```

### Rebuild after code changes

```bash
docker compose up --build
```

### Useful Docker files

- `docker-compose.yml` — runs frontend and backend together
- `backend/Dockerfile` — builds the Spring Boot jar and runs it on Java 21
- `frontend/Dockerfile` — builds the Angular app and serves it with Nginx
- `frontend/nginx.conf` — SPA routing plus `/api` reverse proxy to the backend

## Local Quick Start

### Run both backend and frontend together

```bash
# From the project root:
cd backend && mvn spring-boot:run &
cd frontend && npx ng serve --open
```

### Run individually

**Backend** (port 8080):
```bash
cd backend
mvn spring-boot:run
```

**Frontend** (port 4200, proxies API calls to 8080):
```bash
cd frontend
npm install --legacy-peer-deps   # first time only
npx ng serve
```

Then open [http://localhost:4200](http://localhost:4200).

## Usage

1. Start both backend and frontend
2. Open `http://localhost:4200`
3. Enter your **Azure DevOps Organization**, **Project**, and **PAT** to sign in
4. Use the **gear icon** in the toolbar to manage PAT tokens and environments
