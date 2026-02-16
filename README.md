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

## License

Private — All rights reserved.
