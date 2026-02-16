# PersonalAssistantAI

AI-powered personal assistant for a Chairman managing multiple colleges and a university. The system provides intelligent email management, calendar orchestration, travel planning, meeting coordination, and an AI chat assistant — all powered by Claude AI.

## Features

- **Email Management** — Unified inbox for Gmail and Outlook with AI-powered categorization, priority ranking, smart draft replies, compose, and send
- **Calendar** — Merged view of Google Calendar and Outlook Calendar with conflict detection and event creation
- **Meetings** — Accept/decline recommendations, schedule meetings with attendee invites, and AI-suggested time slots
- **Travel Planning** — Itinerary tracking with automatic detection of travel-related emails, calendar blocking, and document storage
- **AI Chat** — Conversational assistant with real-time access to your emails, calendar, and travel data for contextual answers
- **Dashboard** — AI-generated daily briefing with action items, upcoming meetings, and pending tasks

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui |
| Backend | Python 3.12+, FastAPI |
| AI Engine | Anthropic Claude API |
| Database | PostgreSQL 17 |
| Cache / Queue | Redis 7 |
| Email | Gmail API, Microsoft Graph API |
| Calendar | Google Calendar API, Microsoft Graph API |
| Auth | JWT (access + refresh tokens), OAuth2 (Google, Microsoft) |
| Deployment | Docker Compose with Nginx reverse proxy |

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.12+ (for local backend development)
- Google Cloud project with Gmail and Calendar APIs enabled
- Microsoft Azure app registration (optional, for Outlook)
- Anthropic API key

### Quick Start

1. **Clone the repository**

   ```bash
   git clone git@github.com:sennuramamoorthy/PersonalAssistantAI.git
   cd PersonalAssistantAI
   ```

2. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your API keys and secrets (see [Environment Variables](#environment-variables) below).

3. **Start all services**

   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**

   ```bash
   docker compose exec backend alembic upgrade head
   ```

5. **Open the app**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude AI |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `MICROSOFT_CLIENT_ID` | Microsoft OAuth2 client ID (optional) |
| `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth2 client secret (optional) |
| `MICROSOFT_TENANT_ID` | Microsoft tenant ID (optional) |
| `JWT_SECRET_KEY` | Secret key for JWT token signing — **must be changed** |
| `NEXTAUTH_SECRET` | Secret for NextAuth session encryption — **must be changed** |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

## Development

```bash
# Start all services with Docker
docker-compose up -d

# Frontend development (hot reload)
cd frontend && npm run dev

# Backend development (hot reload)
cd backend && uvicorn app.main:app --reload

# Run backend tests
cd backend && pytest

# Run frontend tests
cd frontend && npm test

# Database migrations
cd backend && alembic upgrade head

# Generate a new migration
cd backend && alembic revision --autogenerate -m "description"
```

## Project Structure

```
PersonalAssistantAI/
├── frontend/                  # Next.js application
│   ├── src/
│   │   ├── app/dashboard/     # App pages (email, calendar, meetings, travel, chat)
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utility functions
│   │   ├── stores/            # Zustand state stores
│   │   └── types/             # TypeScript type definitions
│   └── public/
│
├── backend/                   # FastAPI application
│   ├── app/
│   │   ├── api/               # REST API endpoints
│   │   ├── services/          # Business logic
│   │   ├── integrations/      # External API clients (Gmail, Graph, Claude)
│   │   ├── models/            # SQLAlchemy + Pydantic models
│   │   ├── core/              # Config, security, database
│   │   └── tasks/             # Celery background tasks
│   ├── alembic/               # Database migrations
│   └── tests/
│
├── docker/                    # Dockerfiles and Nginx config
├── docker-compose.yml
└── .env.example               # Environment variable template
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Frontend (Next.js 15)               │
│   Dashboard │ Email │ Calendar │ Meetings │ Chat │
└────────────────────┬─────────────────────────────┘
                     │ REST + SSE
┌────────────────────┴─────────────────────────────┐
│               Backend (FastAPI)                   │
│  Auth (JWT/OAuth) │ AI Agent (Claude) │ Services  │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────┴─────────────────────────────┐
│   PostgreSQL (primary)  │  Redis (cache/queue)    │
└──────────────────────────────────────────────────┘
```

## Security Notes

- All AI-drafted emails require explicit user approval before sending
- OAuth2 tokens are encrypted at rest in PostgreSQL
- JWT access tokens expire in 15 minutes; refresh tokens in 7 days
- Passwords are hashed with bcrypt
- **For production**: Change `JWT_SECRET_KEY` and `NEXTAUTH_SECRET` to strong random values. Use strong database passwords. Deploy behind HTTPS.

## Running Locally with Docker (Step-by-Step)

A complete walkthrough to get the application running on your local machine using Docker.

### Step 1: Install Prerequisites

Make sure the following are installed on your machine:

- **Docker Desktop** (includes Docker Engine and Docker Compose)
  - macOS: [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Windows: [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - Linux: Install Docker Engine and Docker Compose plugin
- **Git** — to clone the repository

Verify installation:

```bash
docker --version          # Docker version 24+ recommended
docker compose version    # Docker Compose v2+
git --version
```

### Step 2: Clone the Repository

```bash
git clone git@github.com:sennuramamoorthy/PersonalAssistantAI.git
cd PersonalAssistantAI
```

### Step 3: Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` in your editor and fill in the **required** values:

```dotenv
# REQUIRED — Get from https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# REQUIRED — Generate strong random secrets (e.g. openssl rand -hex 32)
JWT_SECRET_KEY=<your-random-secret>
NEXTAUTH_SECRET=<your-random-secret>

# REQUIRED for Gmail/Google Calendar — Get from Google Cloud Console
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>

# OPTIONAL — for Outlook/Microsoft Calendar
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
```

> **Tip:** Generate secure secrets with: `openssl rand -hex 32`

The remaining values (`DATABASE_URL`, `REDIS_URL`, ports, etc.) have working defaults and do not need to be changed for local development.

### Step 4: Build and Start All Services

```bash
docker compose up -d --build
```

This builds and starts 5 containers:

| Container | Port | Description |
|---|---|---|
| **db** | 5432 | PostgreSQL 17 database |
| **redis** | 6379 | Redis 7 cache |
| **backend** | 8000 | FastAPI REST API |
| **frontend** | 3000 | Next.js web application |
| **nginx** | 80 | Reverse proxy |

Wait for all containers to be healthy:

```bash
docker compose ps
```

All services should show `Up` or `Up (healthy)`.

### Step 5: Run Database Migrations

```bash
docker compose exec backend alembic upgrade head
```

This creates all the required database tables.

### Step 6: Create Your Admin User

```bash
docker compose exec backend python -m scripts.create_admin \
  --email your-email@example.com \
  --name "Your Name" \
  --password your-secure-password
```

### Step 7: Open the Application

Open your browser and go to:

- **Application:** [http://localhost:3000](http://localhost:3000)
- **API docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

Log in with the email and password you created in Step 6.

### Step 8: Connect Your Email and Calendar

1. Go to **Settings** (sidebar)
2. Click **Connect Google** to link your Gmail and Google Calendar
3. Optionally click **Connect Microsoft** for Outlook

Once connected, your emails and calendar events will appear in the respective screens.

### Common Docker Commands

```bash
# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend

# Restart a single service
docker compose restart backend

# Rebuild and restart after code changes
docker compose up -d --build

# Stop all services (keeps data)
docker compose down

# Stop all services and delete database data
docker compose down -v

# Open a shell inside the backend container
docker compose exec backend bash

# Open a PostgreSQL shell
docker compose exec db psql -U assistant -d assistant
```

### Troubleshooting

| Problem | Solution |
|---|---|
| Containers fail to start | Run `docker compose logs` to check error output |
| Database connection errors | Wait 10 seconds for PostgreSQL health check, then retry |
| Port 3000/8000/80 already in use | Stop other services on those ports, or change ports in `docker-compose.yml` |
| Gmail API 403 error | Enable Gmail API and Calendar API in your Google Cloud Console |
| OAuth redirect mismatch | Add `http://localhost:8000/api/auth/google/callback` to your Google OAuth authorized redirect URIs |
| Frontend shows blank page | Check `docker compose logs frontend` for build errors |
| Migrations fail | Ensure db container is healthy: `docker compose ps` |

### Google OAuth Setup (for Gmail and Calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Gmail API** and **Google Calendar API**
4. Go to **Credentials** > **Create Credentials** > **OAuth 2.0 Client ID**
5. Set application type to **Web application**
6. Add authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
7. Copy the **Client ID** and **Client Secret** to your `.env` file

## License

Private — All rights reserved.
