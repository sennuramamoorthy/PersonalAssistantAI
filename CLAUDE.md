# PersonalAssistantAI

## Project Overview

AI-powered personal assistant for a Chairman managing multiple colleges and a university. The system provides intelligent email management, calendar orchestration, travel planning, and meeting coordination — all powered by Claude AI as the reasoning engine.

## Target User

- **Role**: Chairman of multiple colleges and a university
- **Key contacts**: Students, parents, faculty, vendors, board members
- **Needs**: Email triage, smart responses, calendar management, travel coordination, meeting scheduling

---

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│         Desktop Web / Mobile-Responsive / PWA       │
│                                                     │
│  Dashboard │ Email │ Calendar │ Travel │ Meetings    │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────┴──────────────────────────────┐
│                 Backend (FastAPI)                    │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Auth Module  │  │ Agent Engine │  │ Task Queue │ │
│  │ (JWT/OAuth)  │  │ (Claude API) │  │ (Celery)   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Email Svc   │  │ Calendar Svc │  │ Travel Svc │ │
│  │ Gmail+MSFT  │  │ GCal+Outlook │  │            │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│              Data Layer                             │
│  PostgreSQL (primary) │ Redis (cache/queue)         │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer            | Technology                          |
|------------------|-------------------------------------|
| Frontend         | Next.js 14+ (React, TypeScript)     |
| UI Components    | shadcn/ui + Tailwind CSS            |
| State Management | Zustand or React Query              |
| Backend          | Python 3.12+ / FastAPI              |
| AI Engine        | Anthropic Claude API (claude-sonnet) |
| Task Queue       | Celery + Redis                      |
| Database         | PostgreSQL                          |
| Cache            | Redis                               |
| Email (Google)   | Gmail API (OAuth2)                  |
| Email (MSFT)     | Microsoft Graph API (OAuth2)        |
| Calendar (Google)| Google Calendar API                 |
| Calendar (MSFT)  | Microsoft Graph API                 |
| Auth             | NextAuth.js (frontend) + JWT (API)  |
| Deployment       | Docker + Docker Compose             |
| Future Mobile    | React Native (shared API backend)   |

---

## Authentication & User Validation

### Login Flow
- **Login Page**: Clean, branded login screen as the entry point to the application
- **Local Authentication**: Username/password login with bcrypt-hashed passwords stored in PostgreSQL
- **Session Management**: JWT-based sessions — short-lived access tokens (15 min) + refresh tokens (7 days)
- **Protected Routes**: All frontend pages and API endpoints require valid authentication; unauthenticated requests redirect to login

### OAuth2 Integration (for Email/Calendar access)
- **Google OAuth2**: After login, user connects their Google Workspace account to grant Gmail + Google Calendar access
- **Microsoft OAuth2**: Similarly connects Microsoft 365 for Outlook Mail + Outlook Calendar
- **Token Storage**: OAuth tokens encrypted at rest in PostgreSQL, automatic refresh on expiry
- **Consent Screen**: Users explicitly grant scoped permissions (read mail, manage calendar, etc.)
- **Disconnection**: Users can revoke Google/Microsoft access from settings at any time

### UI Components
- **Login Page** (`/login`): Email/password form with validation errors
- **OAuth Connection Page** (`/settings/connections`): Connect/disconnect Google and Microsoft accounts
- **Session Expiry Modal**: Auto-prompt to re-login when JWT expires
- **Protected Layout Wrapper**: HOC/middleware that gates all authenticated pages

### Security
- Passwords hashed with bcrypt (12+ salt rounds)
- Rate limiting on login endpoint (5 attempts per minute)
- Account lockout after repeated failures
- CSRF protection on all state-changing requests
- Secure, HttpOnly, SameSite cookies for token storage
- All auth routes over HTTPS (enforced by nginx in Docker)

---

## Core Modules

### 1. Email Management
- **Read & Triage**: Fetch emails from Gmail and Outlook, categorize by sender type (student, parent, vendor, faculty, board)
- **Smart Summaries**: AI-generated summaries of email threads
- **Draft Responses**: Claude drafts context-aware replies based on sender type and email content
- **Approval Flow**: Chairman reviews AI draft, edits if needed, then sends
- **Priority Inbox**: AI ranks emails by urgency and importance
- **Bulk Actions**: Archive, label, or respond to batches of similar emails

### 2. Calendar Management
- **Unified View**: Merge Google Calendar and Outlook Calendar into one view
- **Conflict Detection**: Identify scheduling conflicts across all calendars
- **Smart Scheduling**: AI suggests optimal meeting times based on preferences and existing schedule
- **Event Creation**: Create events on the appropriate calendar with attendees, location, and agenda

### 3. Meeting Management
- **Accept/Decline**: AI recommends accept or decline based on priority and schedule
- **Create Invites**: Generate meeting invitations with agenda suggestions
- **Preparation**: AI generates briefing notes before meetings (attendee info, context, prior emails)
- **Follow-up**: Draft follow-up emails after meetings

### 4. Travel Planning
- **Itinerary Management**: Track upcoming travel with flights, hotels, ground transport
- **Calendar Integration**: Block travel time on calendars automatically
- **Document Storage**: Store boarding passes, hotel confirmations, etc.
- **Conflict Alerts**: Warn about meetings that conflict with travel

### 5. Dashboard
- **Daily Briefing**: AI-generated morning summary (key emails, today's meetings, upcoming travel)
- **Action Items**: Pending items requiring Chairman's attention
- **Quick Actions**: One-tap approve/send for AI-drafted responses
- **Analytics**: Email volume, response times, meeting load trends

---

## Multi-Platform Strategy

### Phase 1: Desktop Web (responsive)
- Next.js with responsive design using Tailwind breakpoints
- Works on desktop browsers and tablet browsers
- PWA support for "install to home screen" on mobile devices

### Phase 2: Mobile App (future)
- React Native app sharing the same FastAPI backend
- Push notifications for urgent emails and meeting reminders
- Offline support for reading cached emails and viewing calendar

The backend API is designed as a standalone REST API from day one, making it straightforward to add any client (mobile app, desktop app, voice assistant) in the future.

---

## Project Structure

```
PersonalAssistantAI/
├── frontend/                  # Next.js application
│   ├── src/
│   │   ├── app/               # App router pages
│   │   │   ├── dashboard/
│   │   │   ├── email/
│   │   │   ├── calendar/
│   │   │   ├── meetings/
│   │   │   └── travel/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/            # shadcn/ui primitives
│   │   │   ├── email/
│   │   │   ├── calendar/
│   │   │   └── layout/
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utility functions
│   │   ├── stores/            # Zustand stores
│   │   └── types/             # TypeScript type definitions
│   ├── public/
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                   # FastAPI application
│   ├── app/
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── api/               # API route handlers
│   │   │   ├── auth.py
│   │   │   ├── email.py
│   │   │   ├── calendar.py
│   │   │   ├── meetings.py
│   │   │   ├── travel.py
│   │   │   └── dashboard.py
│   │   ├── services/          # Business logic
│   │   │   ├── email_service.py
│   │   │   ├── calendar_service.py
│   │   │   ├── meeting_service.py
│   │   │   ├── travel_service.py
│   │   │   └── ai_agent.py    # Claude AI orchestration
│   │   ├── integrations/      # External API clients
│   │   │   ├── gmail.py
│   │   │   ├── microsoft_graph.py
│   │   │   └── anthropic_client.py
│   │   ├── models/            # SQLAlchemy/Pydantic models
│   │   ├── core/              # Config, security, dependencies
│   │   └── tasks/             # Celery background tasks
│   ├── alembic/               # Database migrations
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
│
├── docker/
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.example
├── CLAUDE.md                  # This file
└── README.md
```

---

## Environment Variables

```
# AI
ANTHROPIC_API_KEY=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/assistant

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# App
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
```

---

## Development Commands

```bash
# Start all services
docker-compose up -d

# Frontend development
cd frontend && npm run dev

# Backend development
cd backend && uvicorn app.main:app --reload

# Run backend tests
cd backend && pytest

# Run frontend tests
cd frontend && npm test

# Database migrations
cd backend && alembic upgrade head
```

---

## Security Considerations

- All email content is stored encrypted at rest in PostgreSQL
- OAuth2 tokens are stored encrypted; refresh tokens are rotated
- JWT tokens for API auth with short expiry (15 min access, 7 day refresh)
- All AI-drafted emails require Chairman's explicit approval before sending
- Audit log for all actions (email sent, meeting accepted, etc.)
- Rate limiting on all API endpoints
- CORS restricted to known frontend origins
- Self-hosted deployment keeps all data on Chairman's infrastructure

---

## AI Agent Design

The Claude-powered agent operates with these principles:

1. **Read-only by default**: The agent reads and analyzes data, but never takes action (send email, accept meeting) without Chairman's approval
2. **Context-aware**: The agent understands the Chairman's role across multiple institutions and adjusts tone/priority accordingly
3. **Sender classification**: Automatically classifies contacts as student, parent, vendor, faculty, board member to adjust response style
4. **Institutional awareness**: Knows which college/university a communication relates to
5. **Configurable rules**: Chairman can set rules like "auto-decline meetings on Sundays" or "always prioritize board member emails"

---

## Implementation Phases

### Phase 1: Foundation
- Project scaffolding (Next.js + FastAPI + Docker)
- Authentication (user login, Google OAuth, Microsoft OAuth)
- Database setup with migrations
- Basic dashboard layout with responsive design

### Phase 2: Email
- Gmail API integration (read, list, search)
- Microsoft Graph email integration
- Email inbox UI with filters and search
- AI email summarization and categorization
- AI draft responses with approval flow

### Phase 3: Calendar & Meetings
- Google Calendar integration
- Outlook Calendar integration
- Unified calendar view
- Meeting invite creation and accept/decline
- AI scheduling suggestions

### Phase 4: Travel & Polish
- Travel itinerary management
- Calendar blocking for travel
- Daily briefing dashboard
- Notification system (email + in-app)
- Performance optimization

### Phase 5: Mobile (Future)
- React Native mobile app
- Push notifications
- Offline mode
