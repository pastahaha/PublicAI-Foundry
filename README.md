# PublicAI Foundry

A full-stack platform for building, deploying, and conversing with AI agents tailored for public-sector and community use cases — powered by Mistral AI and LangGraph.

Built-in domains:
- **Public Health** — patient intake, symptom triage, health information
- **Legal Aid** — eligibility screening, legal information, service referrals
- **Crisis Support** — mental health, emergency resources, safe messaging
- **Sydney Housing** — rental assistance, application guidance, housing services

---

## Quick Start

```bash
# 1. Enter the repo
cd PublicAI-Foundry

# 2. Set environment variables
cp .env.example .env
# Required: MISTRAL_API_KEY, JWT_SECRET
# Generate JWT secret: openssl rand -base64 32

# 3. Build and start
docker compose up --build

# 4. Open http://localhost:3000
```

First run takes ~2 minutes. Postgres initialises, the backend migrates its schema, and the frontend runs `prisma db push` automatically on startup.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MISTRAL_API_KEY` | **Yes** | Mistral AI API key — used for all LLM and orchestrator calls |
| `JWT_SECRET` | **Yes** | ≥32-char secret for signing user session tokens |
| `ELEVENLABS_API_KEY` | No | Enables voice TTS (text-to-speech) and STT (speech-to-text) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth — enables "Sign in with Google" |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `TWILIO_WHATSAPP_NUMBER` | No | Twilio sandbox number for WhatsApp agent integration |

---

## Services

| Service | Port | Stack |
|---|---|---|
| Frontend | 3000 | Next.js 16, Prisma, PostgreSQL `publicai_users` |
| Backend | 8082 | FastAPI, LangGraph, SQLAlchemy, PostgreSQL `publicai_foundry` |
| PostgreSQL | 5432 | Two logical databases on one instance |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser                                      │
│                                                                         │
│   /login  /signup        /agents/create         /playground             │
│   Auth pages             Agent Builder          Chat + Voice            │
│                          (Orchestrator UI)      (Markdown + TTS/STT)    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │  HTTP
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend  :3000                            │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  API Routes  (Backend-For-Frontend)               │  │
│  │                                                                   │  │
│  │  /api/auth/*              Login, signup, logout, Google OAuth     │  │
│  │  /api/agents              GET list, POST create  ──────────────┐  │  │
│  │  /api/agents/[id]         GET, PATCH, DELETE  ─────────────────┤  │  │
│  │  /api/orchestrator        POST chat turn  ──────────────────────┤  │  │
│  │  /api/orchestrator/[tid]  GET history  ────────────────────────┤  │  │
│  │  /api/proxy/run           POST → agent chat → SSE stream  ──────┤  │  │
│  │  /api/health              GET backend status  ──────────────────┤  │  │
│  │  /api/sessions            GET list, POST create (Prisma)        │  │  │
│  │  /api/sessions/[id]       GET, PATCH, DELETE (Prisma)          │  │  │
│  │  /api/sessions/[id]/messages  POST append (Prisma)             │  │  │
│  │  /api/voice/tts           POST text → audio/mpeg (ElevenLabs)  │  │  │
│  │  /api/voice/stt           POST webm → transcript (ElevenLabs)  │  │  │
│  │  /api/whatsapp/webhook    POST Twilio inbound  ─────────────────┤  │  │
│  │  /api/settings            GET/PATCH user profile (Prisma)      │  │  │
│  └──────────────────────────────┬──────────────────────────────────┘  │
│                                 │ server-side only (INTERNAL_BACKEND_URL)│
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │  Prisma ORM → PostgreSQL: publicai_users                        │   │
│  │  User  ·  ChatSession  ·  ChatMessage  ·  WhatsAppSession       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                 │  X-User-Id header (internal trusted)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend  :8082                             │
│                                                                         │
│  /api/health                    DB + LangGraph health check             │
│  /api/v1/assistant/             Agent CRUD (AssistantORM)               │
│  /api/v1/orchestrator/chat      Multi-turn conversational builder       │
│  /api/v1/orchestrator/use-cases NSW domain presets                      │
│  /api/v1/agent/{id}/chat        Run agent, return JSON response         │
│  /api/v1/kb/                    Knowledge base management               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator_agent.py    Multi-phase LangGraph builder         │    │
│  │  blueprint_compiler.py    Blueprint JSON → runnable LangGraph   │    │
│  │  blueprint_graph_service  Graph execution + caching             │    │
│  │  tool_catalogue.py        Tool registry (web_search, etc.)      │    │
│  └──────────────────────────────────────────────────────────────┬──┘    │
│                                                                 │       │
│  ┌──────────────────────────────────────────────────────────────▼──┐    │
│  │  SQLAlchemy ORM → PostgreSQL: publicai_foundry                  │    │
│  │  assistants  ·  threads  ·  runs  ·  knowledge_bases            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────┐
              │  External APIs                   │
              │  Mistral AI    (LLM)             │
              │  ElevenLabs    (TTS + STT)       │
              │  Twilio        (WhatsApp)        │
              │  Google OAuth  (optional)        │
              └──────────────────────────────────┘
```

---

## Data Flows

### Creating an Agent

```
User opens /agents/create
  └─ Fills wizard (name, model, tools, guardrails, knowledge base)
     └─ Clicks "Build with AI"
        └─ Form data formatted into a structured prompt
           └─ POST /api/orchestrator
              └─ backend /api/v1/orchestrator/chat
                 └─ LangGraph orchestrator (5 phases):
                      clarifying → researching → planning → reviewing → finalised
                    returns GeneratedBlueprint + suggested name
                 └─ Frontend shows blueprint summary + "Save Agent" button
                    └─ POST /api/agents
                       └─ backend saves AssistantORM with blueprint JSON
                          └─ redirect to /agents
```

### Chatting in the Playground

```
User types or holds mic button (STT)
  └─ POST /api/proxy/run
     └─ backend /api/v1/agent/{id}/chat
        └─ blueprint_compiler builds LangGraph:
             orchestrator-created agents → uses stored GeneratedBlueprint
             form-created agents        → single-node fallback from config
           Graph: [tool nodes?] → brain LLM node → END
           brain node appends synthetic HumanMessage if last msg is AI
           (Mistral requires last message to be user/tool role)
        └─ JSON response → Next.js wraps as SSE
           └─ Playground streams text, renders markdown
              └─ POST /api/sessions/[id]/messages  (persists to DB)
                 └─ Auto-speak via ElevenLabs TTS (unless muted)
                    └─ Per-message speaker icon for on-demand playback
```

### WhatsApp

```
Twilio inbound  →  POST /api/whatsapp/webhook
  └─ Fetch agent config from backend
     └─ Call Mistral API directly
        └─ Reply via Twilio Messages API
```

---

## Project Structure

```
PublicAI-Foundry/
│
├── backend/                              FastAPI + LangGraph
│   ├── app.py                            Hypercorn ASGI entry point (:8082)
│   ├── pyproject.toml                    Python deps managed by uv
│   ├── Dockerfile
│   └── src/
│       ├── main.py                       FastAPI app, CORS, lifespan
│       ├── routers/
│       │   └── publicai_foundry_router.py
│       ├── controllers/
│       │   ├── health_controller.py      GET /api/health
│       │   └── v1/
│       │       ├── assistant_controller.py       Agent CRUD
│       │       ├── orchestrator_chat_controller.py  Builder chat
│       │       ├── orchestrator_controller.py    Use-case presets
│       │       ├── agent_chat_controller.py      Run agent
│       │       └── knowledge_base_controller.py  KB management
│       ├── services/
│       │   ├── orchestrator_agent.py     Multi-phase LangGraph builder
│       │   │                             Phases: clarifying → researching →
│       │   │                             planning → reviewing → finalised
│       │   ├── blueprint_compiler.py     GeneratedBlueprint → LangGraph graph
│       │   │                             Auto-injects brain node on every agent
│       │   ├── blueprint_graph_service.py  Graph execution + thread management
│       │   └── tool_catalogue.py         Registry: web_search, summarize_text,
│       │                                 rights_lookup, crisis_classifier, etc.
│       └── core/
│           ├── database.py               SQLAlchemy async engine
│           │                             LangGraph PostgreSQL checkpointer
│           ├── models/
│           │   ├── assistant.py          AssistantORM, KnowledgeBaseORM
│           │   ├── orchestrator.py       GeneratedBlueprint, NodeBlueprint
│           │   └── thread.py            ThreadORM, RunORM
│           └── config/
│               └── base_settings.py     Pydantic settings from env
│
├── frontend/                             Next.js 16 (App Router) + Prisma
│   ├── app/
│   │   ├── (auth)/                       /login, /signup
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx               Sidebar + session auth guard
│   │   │   ├── agents/                  List, create, edit agents
│   │   │   │   ├── create/
│   │   │   │   │   ├── page.tsx         Server component (auth check)
│   │   │   │   │   └── client.tsx       Switches between wizard and chat
│   │   │   ├── playground/
│   │   │   │   ├── page.tsx             Fetches agents server-side
│   │   │   │   └── client.tsx           Full playground UI:
│   │   │   │                            · Session sidebar (rename/delete)
│   │   │   │                            · Markdown-rendered messages
│   │   │   │                            · Per-message speaker button
│   │   │   │                            · Auto TTS + mute toggle
│   │   │   │                            · Voice input (hold mic)
│   │   │   ├── whatsapp/                WhatsApp session manager
│   │   │   └── settings/                Profile + API key management
│   │   └── api/
│   │       ├── auth/                    login, signup, logout, me, google
│   │       ├── agents/                  Proxy → backend CRUD
│   │       ├── orchestrator/            Proxy → backend orchestrator
│   │       ├── proxy/run/               Agent chat → SSE stream wrapper
│   │       ├── voice/tts|stt/           ElevenLabs voice I/O
│   │       ├── sessions/                Chat session CRUD (Prisma)
│   │       ├── sessions/[id]/messages/  Append message
│   │       ├── health/                  Proxy → backend /api/health
│   │       ├── whatsapp/webhook/        Twilio inbound
│   │       └── settings/               User preferences
│   ├── components/
│   │   ├── agents/
│   │   │   ├── agent-form.tsx          7-step wizard (model, tools, guardrails, KB)
│   │   │   │                           "Build with AI" → formats all fields as
│   │   │   │                           structured prompt for the orchestrator
│   │   │   ├── orchestrator-chat.tsx   AI-guided builder chat UI
│   │   │   │                           Accepts initialPrompt from wizard
│   │   │   └── voice-input-btn.tsx     Hold-to-record mic (MediaRecorder API)
│   │   └── dashboard/
│   │       ├── sidebar.tsx             Collapsible nav, mobile drawer
│   │       └── topbar.tsx              Page header + theme toggle
│   ├── lib/
│   │   ├── auth.ts                     JWT cookie helpers (jose)
│   │   ├── backend.ts                  INTERNAL_BACKEND_URL resolver
│   │   └── db.ts                       Prisma singleton
│   ├── prisma/schema.prisma
│   ├── Dockerfile
│   └── next.config.ts                  standalone output + transpilePackages
│
├── init-db.sql                          Creates publicai_users DB on first start
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Database Schema

### `publicai_users` — Prisma (frontend)

```
User
  id (cuid), name, email (unique), passwordHash
  mistralApiKey, elevenLabsApiKey, elevenLabsVoiceId
  theme, createdAt, updatedAt
  → ChatSession[], WhatsAppSession[]

ChatSession                         One per conversation in the playground
  id, userId → User
  agentId, agentName                References backend assistant_id
  title                             Auto-set from first user message
  threadId (unique)                 Matches backend ThreadORM.thread_id
  createdAt, updatedAt
  → ChatMessage[]

ChatMessage
  id, sessionId → ChatSession
  role ("user" | "assistant")
  content, createdAt

WhatsAppSession
  id, phone (unique), userId → User
  agentId, menuState
  conversationJson (JSON string)
```

### `publicai_foundry` — SQLAlchemy (backend)

```
assistants
  assistant_id (UUID), user_id, name, description
  config JSON:
    model_provider, model_name, system_prompt
    tools [], blueprint (GeneratedBlueprint)
  metadata_json:
    guardrails { toxicity, pii, customInstructions }
    knowledgeBase { context, urls[] }

threads
  thread_id (UUID), user_id, assistant_id → assistants

runs
  run_id (UUID), thread_id → threads
  input, output, status

knowledge_bases
  kb_id (UUID), assistant_id → assistants
  name, content, source_urls JSON
```

---

## Agent Blueprint System

Every agent stores a `GeneratedBlueprint` in its config. At chat time `blueprint_compiler.py` compiles it into a LangGraph:

```
GeneratedBlueprint
  name, description, goal, max_iterations
  nodes[]
    id, name, node_type  (llm | tool | aggregator)
    model_provider, model_name, temperature
    system_prompt, tool_names[]
  edges[]
    source, target
    edge_type  (direct | conditional)
    condition?  (natural language, evaluated by router)

Compiled graph:
  [entry node] ──► [intermediate nodes] ──► [terminal node]
                                                   │
                                                   ▼
                                              brain node          ← auto-injected
                                         (reads all messages,     on every agent
                                          synthesises response)
                                                   │
                                                   ▼
                                                  END
```

**Form-created agents** (no blueprint) get a single-node fallback built from `config.system_prompt` + `config.tools` at runtime — no special code path needed.

**Guardrails + Knowledge Base** are injected into the brain node's system prompt at runtime:
```
{system_prompt}

GUARDRAILS:
- Never generate harmful, offensive, or toxic content.
- Never collect or reveal personally identifiable information.
- {custom_instructions}

KNOWLEDGE BASE CONTEXT:
{context}

REFERENCE SOURCES:
- {url1}
- {url2}
```

---

## Security

| Concern | Mitigation |
|---|---|
| Session tokens | HTTP-only JWT cookies; never readable from JavaScript |
| Backend user isolation | `X-User-Id` header set by Next.js server routes only — the browser never sends it directly to the backend |
| Data isolation | Every DB query filters by `userId`; guessing another session's ID returns 404 |
| API keys | Stored in DB (per-user) or env vars; never included in API responses or sent to the browser |
| Backend CORS | Allows `*` — safe because the backend port (8082) is not internet-exposed; only Next.js server routes call it internally |

---

## Development (without Docker)

**Backend**
```bash
cd backend
cp .env.example .env        # set DATABASE_URL, MISTRAL_API_KEY
pip install uv
uv sync
uv run python app.py        # :8082
```

**Frontend**
```bash
cd frontend
cp .env.example .env.local  # set DATABASE_URL, JWT_SECRET, INTERNAL_BACKEND_URL
npm install
npx prisma db push
npm run dev                 # :3000
```

**Postgres** (local, two DBs on one instance)
```bash
docker run -e POSTGRES_USER=publicai -e POSTGRES_PASSWORD=publicai_dev \
  -e POSTGRES_DB=publicai_foundry -p 5432:5432 postgres:16-alpine

# In a second terminal, create the users DB:
psql -U publicai -h localhost publicai_foundry \
  -c "CREATE DATABASE publicai_users;"
```
