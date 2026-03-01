<p align="center">
  <img src="frontend/public/logo.png" alt="PublicAI Foundry" width="80" />
</p>

<h1 align="center">PublicAI Foundry</h1>

<p align="center">
  <strong>Build AI agents for public good — no code required.</strong><br/>
  An open-source platform that lets anyone create, deploy, and converse with AI agents<br/>
  tailored for public-sector and community use cases.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#tech-stack">Tech Stack</a>
</p>

---

## The Problem

Millions of Australians struggle to navigate complex government services — housing applications, legal aid, crisis support, healthcare eligibility. The information exists, but it's scattered across hundreds of websites, written in bureaucratic language, and nearly impossible to find when you need it most.

Public servants want to help, but they're overwhelmed. Community organisations can't scale. And the people who need help the most — those in crisis, those with low digital literacy, those who speak English as a second language — are the least likely to find it.

## The Solution

**PublicAI Foundry** is a platform where anyone — a caseworker, a community volunteer, a government employee — can build a specialised AI agent in minutes by simply describing what it should do. No code. No infrastructure. Just tell the AI what kind of help you want to provide, and it builds the agent for you.

The platform comes with built-in safeguards for vulnerable populations: trauma-informed communication patterns, crisis detection and escalation, PII protection, and mandatory safety referrals. Every agent gets these guardrails by default.

**Built-in domains (all NSW / Australia focused):**

| Domain | What it covers |
|---|---|
| 🏠 **Housing Crisis** | Social housing, emergency accommodation, tenancy rights, bond assistance |
| ⚖️ **Legal Aid** | Eligibility screening, tenancy law, DV orders, community legal centres |
| 🏥 **Healthcare** | Medicare, mental health services, rural health access, NDIS |
| 🆘 **Crisis Support** | Domestic violence, disaster relief, emergency welfare, safety planning |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/pastahaha/PublicAI-Foundry.git
cd PublicAI-Foundry

# 2. Set environment variables (optional — defaults work out of the box)
cp .env.example .env
# Required: MISTRAL_API_KEY
# Optional: JWT_SECRET, ELEVENLABS_API_KEY, GOOGLE_CLIENT_ID

# 3. Build and start all services
docker compose up --build

# 4. Open http://localhost:3000
```

First run takes ~2 minutes. Postgres initialises both databases, the backend migrates its schema, and the frontend runs `prisma db push` automatically.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MISTRAL_API_KEY` | **Yes** | Mistral AI API key — powers all LLM calls and the orchestrator |
| `JWT_SECRET` | No | ≥32-char secret for signing session tokens (has a default) |
| `ELEVENLABS_API_KEY` | No | Enables voice TTS and STT across the platform |
| `TAVILY_API_KEY` | No | Enables the `web_search` tool (Tavily search API) |
| `OLLAMA_BASE_URL` | No | Connect to a local Ollama instance for self-hosted models |
| `GOOGLE_CLIENT_ID` | No | Google OAuth — "Sign in with Google" |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `TWILIO_WHATSAPP_NUMBER` | No | Twilio sandbox number for WhatsApp integration |

---

## Features

### 🤖 AI-Powered Agent Builder (Orchestrator)

The core innovation. Instead of filling out forms, you **describe** the agent you want in natural language — by typing or speaking — and a multi-phase LangGraph orchestrator builds it for you:

1. **Clarifier** — analyses your description, asks follow-up questions if anything is ambiguous
2. **Researcher** — deep-researches what tools, skills, and knowledge bases best fit the use-case
3. **Planner** — generates a full agent blueprint (nodes, edges, tools, system prompts)
4. **Reviewer** — self-critiques the blueprint; if gaps are found, loops back to the planner
5. **Finaliser** — emits the approved blueprint, ready to deploy

You can also build agents manually through a **7-step wizard** (name → model → tools → guardrails → knowledge base → system prompt → review) and click "Build with AI" at any point to hand off to the orchestrator with all your filled-in context.

### 🎙️ Continuous Voice Input

Speak your agent into existence. The voice system uses a dual-mode architecture:

- **Primary (Chrome, Edge, Safari):** Web Speech API with `continuous=true` and `interimResults=true` — real-time streaming transcription. Words appear live as you speak, with an `[…]` marker showing interim text.
- **Fallback (Firefox):** MediaRecorder → ElevenLabs Scribe STT for browsers without the Web Speech API.

Voice input works everywhere: the agent builder, the playground, the orchestrator chat, and the system prompt editor.

### 💬 Playground — Live Agent Chat

A full-featured chat interface for testing and using your agents:

- **SSE streaming** — responses stream in real-time via Server-Sent Events
- **Rich markdown rendering** — headers, tables, code blocks, links, blockquotes
- **Session management** — create, rename, delete conversations with full history
- **Agent selector** — switch between agents mid-conversation
- **Model picker** — choose between Mistral Large, Mistral Small, Open Mistral 7B, or local Ollama models
- **Auto TTS** — agents speak their responses aloud via ElevenLabs (toggleable)
- **Per-message playback** — click any message's speaker icon to hear it
- **Per-agent voice selection** — assign different ElevenLabs voices to different agents
- **Voice input** — speak your messages with continuous live transcription

### 📱 WhatsApp Integration

Access your agents via WhatsApp through the Twilio sandbox:

- **QR code onboarding** — scan to open WhatsApp with a pre-filled "Hey" message
- **Menu-driven interaction** — login, agent selection, and free-form chat
- **Greeting support** — "Hey", "Hi", "Hello", "Start" all trigger the welcome flow
- **Session persistence** — conversations persist across messages via Prisma
- **Commands reference** — in-app guide showing all available WhatsApp commands

### 🛡️ Built-in Guardrails

Every agent gets configurable safety rails:

- **Toxicity filtering** — prevent harmful, offensive, or toxic content generation
- **PII redaction** — never collect or reveal personally identifiable information
- **Custom instructions** — add domain-specific restrictions (e.g. "never provide legal advice, only legal information")
- **Crisis detection** — automatic escalation when crisis situations are detected
- **Mandatory referrals** — always provide relevant hotline numbers for safety-critical domains

### 🧰 12 Universal Tools

Every agent has access to a catalogue of 12 real, functional tools:

| Tool | Category | What it does |
|---|---|---|
| `web_search` | Research | Live web search via Tavily API |
| `scrape_url` | Research | Extract content from any URL |
| `summarize_text` | Text | Condense long documents via Mistral |
| `document_explainer` | Text | Plain-English explanation of complex documents |
| `retrieval_query` | Knowledge | Query the agent's vector knowledge base |
| `eligibility_checker` | Assessment | Check eligibility for government programs |
| `service_locator` | Directory | Find nearby services by location |
| `rights_lookup` | Legal | Look up rights under NSW law |
| `crisis_classifier` | Assessment | Classify crisis type and urgency |
| `safety_planner` | Safety | Create personalised safety plans |
| `hotline_directory` | Directory | Return relevant emergency hotline numbers |
| `human_review` | Workflow | Escalate to a human operator |

The orchestrator sees the full tool catalogue and selects the best tools for each agent, providing a justification for each choice.

### 🎯 9 Built-in Skills

Reusable capability modules that inject expert-level instructions into agent nodes:

| Skill | Category | Description |
|---|---|---|
| Deep Research | Research | Multi-source research with verification and cross-referencing |
| Document Analysis | Analysis | Extract key info from complex documents, explain in plain language |
| Eligibility Assessment | Assessment | Assess eligibility for government programs and benefits |
| Crisis Response | Safety | Trauma-informed crisis support with safety assessment |
| Step-by-Step Guidance | Communication | Walk users through complex processes with numbered steps |
| Empathetic Communication | Communication | Culturally sensitive, plain-language communication |
| Service Navigation | Navigation | Find and connect users with local services and support |
| Comparative Analysis | Analysis | Side-by-side comparison of options with pros/cons |
| Knowledge Base Retrieval | Knowledge | Search and synthesise from the agent's knowledge base |

Skills follow a **3-level progressive disclosure** pattern:
- **Level 1 (Metadata)** — name + description, always visible in prompts
- **Level 2 (Body)** — full instructions, injected when a skill is selected
- **Level 3 (Resources)** — external references, loaded on-demand

### 📚 Knowledge Base

Attach domain-specific context and reference sources to any agent:

- **Context text** — free-form text injected into the agent's system prompt
- **Reference URLs** — curated source URLs from authoritative government sites
- **Pre-built domain sources** — each use-case template comes with curated NSW government reference URLs
- **ChromaDB vector store** — backend knowledge base management with embedding support

### 🎨 Landing Page

A polished, animated marketing-style landing page with:

- Animated hero with live chat simulation and rotating use-case text
- "How It Works" 3-step walkthrough
- Impact numbers section
- Use-case showcase cards
- Feature grid (Voice-First, Guardrails, Human-in-the-Loop, Instant Deploy, Multi-Agent, Observability)
- Manifesto / mission statement
- CTA section with signup link
- Cursor glow effect and smooth scroll animations (Framer Motion + GSAP)

### ⚙️ Settings & Personalisation

Per-user configuration:

- **Profile** — update name, email, password
- **API Keys** — set personal Mistral AI and ElevenLabs keys (stored encrypted, never sent to browser)
- **Voice** — choose from 9 ElevenLabs voices for TTS playback
- **Theme** — dark / light mode toggle (persisted to DB)

### 🔐 Authentication

- Email/password signup and login with bcrypt hashing
- Google OAuth ("Sign in with Google") — optional
- HTTP-only JWT cookies — never readable from JavaScript
- Server-side session guard on all dashboard routes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser                                      │
│                                                                         │
│   /                          Landing page (animated, public)            │
│   /login  /signup            Auth pages                                 │
│   /agents/create             Agent Builder (wizard + orchestrator chat) │
│   /playground                Chat + Voice + Markdown + TTS              │
│   /whatsapp                  WhatsApp session manager + QR onboarding   │
│   /settings                  Profile, API keys, voice, theme            │
│   /dashboard                 Analytics overview                         │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTP
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Next.js 16 Frontend  :3000                          │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                 API Routes  (Backend-For-Frontend)                │  │
│  │                                                                   │  │
│  │  /api/auth/*              Login, signup, logout, Google OAuth     │  │
│  │  /api/agents              GET list · POST create  ─────────────┐  │  │
│  │  /api/agents/[id]         GET · PATCH · DELETE  ───────────────┤  │  │
│  │  /api/orchestrator        POST chat turn  ──────────────────────┤  │  │
│  │  /api/orchestrator/[tid]  GET history  ────────────────────────┤  │  │
│  │  /api/proxy/run           POST → agent chat → SSE stream  ──────┤  │  │
│  │  /api/health              GET backend status  ──────────────────┤  │  │
│  │  /api/sessions            GET list · POST create (Prisma)       │  │  │
│  │  /api/sessions/[id]       GET · PATCH · DELETE (Prisma)        │  │  │
│  │  /api/sessions/[id]/messages  POST append (Prisma)             │  │  │
│  │  /api/voice/tts           POST text → audio/mpeg (ElevenLabs)  │  │  │
│  │  /api/voice/stt           POST webm → transcript (ElevenLabs)  │  │  │
│  │  /api/whatsapp/webhook    POST Twilio inbound  ─────────────────┤  │  │
│  │  /api/settings            GET/PATCH user profile (Prisma)      │  │  │
│  └──────────────────────────────┬──────────────────────────────────┘  │
│                                 │ INTERNAL_BACKEND_URL (server-side)   │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │  Prisma ORM → PostgreSQL: publicai_users                        │   │
│  │  User · ChatSession · ChatMessage · WhatsAppSession             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                 │ X-User-Id header (internal trusted)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend  :8082                               │
│                                                                         │
│  /api/health                    DB + LangGraph health check             │
│  /api/v1/assistant/             Agent CRUD (AssistantORM)               │
│  /api/v1/orchestrator/chat      Multi-turn conversational builder       │
│  /api/v1/orchestrator/use-cases NSW domain presets                      │
│  /api/v1/agent/{id}/chat        Run agent → JSON response              │
│  /api/v1/kb/                    Knowledge base management               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  orchestrator_agent.py    5-phase LangGraph builder             │    │
│  │  blueprint_compiler.py    Blueprint → runnable LangGraph graph  │    │
│  │  blueprint_graph_service  Graph execution + thread management   │    │
│  │  tool_catalogue.py        12 universal tools (real impls)       │    │
│  │  skill_catalogue.py       9 reusable skills (3-level system)    │    │
│  │  voice_service.py         ElevenLabs TTS + STT                  │    │
│  │  network_caching_service  In-memory async cache with TTL        │    │
│  └────────────────────────────────────────────────────────────┬────┘    │
│  ┌────────────────────────────────────────────────────────────▼────┐    │
│  │  SQLAlchemy ORM → PostgreSQL: publicai_foundry                  │    │
│  │  assistants · threads · runs · knowledge_bases                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
              ┌──────────────────────────────────┐
              │  External APIs                   │
              │  Mistral AI    (LLM)             │
              │  ElevenLabs    (TTS + STT)       │
              │  Tavily        (Web Search)      │
              │  Twilio        (WhatsApp)        │
              │  Google OAuth  (optional)        │
              │  Ollama        (local models)    │
              └──────────────────────────────────┘
```

### Services

| Service | Port | Stack |
|---|---|---|
| Frontend | 3000 | Next.js 16.1.6 (App Router), React 19, Prisma, PostgreSQL |
| Backend | 8082 | FastAPI, LangGraph, SQLAlchemy async, ChromaDB |
| PostgreSQL | 5432 | Two logical databases on one Postgres 16 Alpine instance |

---

## How It Works

### Creating an Agent

```
User opens /agents/create
  └─ Option A: 7-step wizard
  │    Name → Model → Tools → Guardrails → Knowledge Base → System Prompt → Review
  │    └─ Click "Build with AI" at any step
  │       └─ All filled fields formatted into a structured prompt
  │
  └─ Option B: Describe directly in the orchestrator chat
     └─ POST /api/orchestrator
        └─ backend: /api/v1/orchestrator/chat
           └─ LangGraph orchestrator (5 phases):
                clarifying → researching → planning → reviewing → finalised
              returns GeneratedBlueprint + suggested name
           └─ Frontend shows blueprint summary + "Save Agent" button
              └─ POST /api/agents → backend saves AssistantORM
                 └─ Agent is live, ready to chat in the Playground
```

### Chatting with an Agent

```
User types or speaks (continuous voice → live transcription)
  └─ POST /api/proxy/run
     └─ backend: /api/v1/agent/{id}/chat
        └─ blueprint_compiler builds a LangGraph at runtime:
             Has blueprint? → compile nodes + edges + brain node
             No blueprint?  → single-node fallback from config
        └─ Graph executes: [tool nodes] → [brain node] → END
        └─ JSON response → Next.js wraps as SSE stream
           └─ Playground streams markdown, renders rich content
              └─ Message persisted to ChatSession (Prisma)
                 └─ Auto-speak via ElevenLabs TTS (if enabled)
```

### WhatsApp Flow

```
User scans QR or sends "Hey" to Twilio number
  └─ POST /api/whatsapp/webhook
     └─ No account? → Welcome message with login instructions
     └─ Authenticated? → Show agent menu
        └─ Pick an agent by number → start chatting
           └─ Messages proxied to Mistral API
              └─ Reply sent back via Twilio
```

---

## Agent Blueprint System

Every agent built by the orchestrator stores a `GeneratedBlueprint` in its config. At chat time, `blueprint_compiler.py` compiles it into a live LangGraph:

```
GeneratedBlueprint
  ├── name, description, goal, max_iterations
  ├── nodes[]
  │     id, name, node_type (llm | tool | aggregator)
  │     model_provider, model_name, temperature
  │     system_prompt, tool_names[], skill_ids[]
  └── edges[]
        source, target
        edge_type (direct | conditional)
        condition? (natural language, evaluated by router)

Compiled LangGraph:
  [entry node] → [intermediate nodes] → [terminal node]
                                              │
                                              ▼
                                         brain node          ← auto-injected
                                    (reads all messages,       on every agent
                                     synthesises response,
                                     injects guardrails +
                                     knowledge base context)
                                              │
                                              ▼
                                             END
```

**Form-created agents** (no blueprint) get a single-node fallback built from `config.system_prompt` + `config.tools` — no special handling needed.

**Guardrails + Knowledge Base** are injected into the brain node's system prompt:
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

**Skills** are injected at compile time — when a node has `skill_ids`, the skill's Level 2 instructions are appended to that node's system prompt.

---

## Tech Stack

### Backend

| Component | Technology |
|---|---|
| Runtime | Python 3.12 |
| Web framework | FastAPI + Hypercorn (ASGI) |
| AI orchestration | LangGraph (graph-based agent workflows) |
| LLM provider | Mistral AI (`langchain-mistralai`) + Ollama (`langchain-ollama`) |
| Database | PostgreSQL 16 + SQLAlchemy async + asyncpg |
| Vector store | ChromaDB |
| Web search | Tavily |
| Scraping | httpx + BeautifulSoup4 |
| Voice | ElevenLabs (TTS + STT) |
| SSE streaming | sse-starlette |
| Logging | structlog |

### Frontend

| Component | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router, standalone output) |
| React | React 19.2 |
| Database | Prisma ORM → PostgreSQL |
| Auth | JWT (jose) + bcryptjs + HTTP-only cookies |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion + GSAP |
| UI components | shadcn/ui (Radix primitives) |
| Forms | React Hook Form + Zod validation |
| Markdown | react-markdown + remark-gfm |
| State | Zustand |
| Voice (STT) | Web Speech API (primary) + ElevenLabs Scribe (fallback) |
| Voice (TTS) | ElevenLabs (`eleven_multilingual_v2`) |
| QR codes | qrcode.react |
| Notifications | Sonner toasts |

### Infrastructure

| Component | Technology |
|---|---|
| Containerisation | Docker Compose |
| Database | PostgreSQL 16 Alpine (2 logical DBs) |
| Package management | uv (backend) · npm (frontend) |

---

## Database Schema

### `publicai_users` — Prisma (frontend)

```
User
  id (cuid), name, email (unique), passwordHash, image
  mistralApiKey, elevenLabsApiKey, elevenLabsVoiceId
  theme ("dark" | "light"), createdAt, updatedAt
  → ChatSession[], WhatsAppSession[]

ChatSession
  id, userId → User
  agentId, agentName, title, threadId (unique)
  → ChatMessage[]

ChatMessage
  id, sessionId → ChatSession
  role ("user" | "assistant"), content, createdAt

WhatsAppSession
  id, phone (unique), userId → User
  agentId, menuState, conversationJson
```

### `publicai_foundry` — SQLAlchemy (backend)

```
assistants
  assistant_id (UUID), user_id, name, description
  config JSON: { model_provider, model_name, system_prompt,
                 tools[], blueprint (GeneratedBlueprint) }
  metadata_json: { guardrails, knowledgeBase }

threads
  thread_id (UUID), user_id, assistant_id → assistants

runs
  run_id (UUID), thread_id → threads, input, output, status

knowledge_bases
  kb_id (UUID), assistant_id → assistants, name, content, source_urls
```

---

## Project Structure

```
PublicAI-Foundry/
├── docker-compose.yml                    3-service stack (postgres, backend, frontend)
├── init-db.sql                           Creates second DB on first boot
│
├── backend/                              Python 3.12 · FastAPI · LangGraph
│   ├── app.py                            Hypercorn ASGI entry point (:8082)
│   ├── pyproject.toml                    Dependencies (managed by uv)
│   ├── Dockerfile
│   └── src/
│       ├── main.py                       FastAPI app, CORS, lifespan
│       ├── config/                       Pydantic settings from env
│       ├── core/
│       │   ├── database.py               Async engine + LangGraph checkpointer
│       │   ├── models/                   AssistantORM, ThreadORM, GeneratedBlueprint
│       │   └── use_cases.py              4 NSW domain presets with curated sources
│       ├── controllers/
│       │   ├── health_controller.py
│       │   └── v1/                       Agent CRUD, orchestrator chat, KB, agent chat
│       └── services/
│           ├── orchestrator_agent.py     5-phase LangGraph builder (1125 lines)
│           ├── blueprint_compiler.py     Blueprint → runnable graph (525 lines)
│           ├── blueprint_graph_service.py
│           ├── tool_catalogue.py         12 tools with real implementations (779 lines)
│           ├── skill_catalogue.py        9 skills with 3-level disclosure (478 lines)
│           ├── voice_service.py          ElevenLabs TTS + STT
│           └── network_caching_service.py  Async in-memory cache
│
├── frontend/                             Next.js 16 · React 19 · Prisma
│   ├── app/
│   │   ├── page.tsx                      Landing page (public)
│   │   ├── (auth)/                       /login, /signup
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                Sidebar + session auth guard
│   │   │   ├── dashboard/               Analytics overview
│   │   │   ├── agents/                  List, create, edit agents
│   │   │   ├── playground/             Full chat UI with SSE + TTS + voice
│   │   │   ├── whatsapp/               QR onboarding + session manager
│   │   │   └── settings/               Profile, API keys, voice, theme
│   │   └── api/                         18 API routes (BFF pattern)
│   ├── components/
│   │   ├── agents/
│   │   │   ├── agent-form.tsx           7-step wizard (1273 lines)
│   │   │   ├── orchestrator-chat.tsx    AI builder chat UI (607 lines)
│   │   │   └── voice-input-btn.tsx     Continuous voice (Web Speech + fallback)
│   │   ├── dashboard/                   Sidebar, topbar, stat cards
│   │   ├── landing/                     11 animated landing page sections
│   │   ├── providers/                   Theme provider
│   │   └── ui/                          16 shadcn/ui components
│   ├── lib/                             Auth, backend URL, Prisma, utils
│   └── prisma/schema.prisma             4 models
└── README.md
```

---

## Security

| Concern | Mitigation |
|---|---|
| Session tokens | HTTP-only JWT cookies; never readable from JavaScript |
| Backend isolation | `X-User-Id` header set by Next.js server routes only — browser never sends it |
| Data isolation | Every query filters by `userId`; guessing a session ID returns 404 |
| API keys | Per-user keys stored in DB; never included in API responses or sent to browser |
| Passwords | Hashed with bcryptjs; never stored in plaintext |
| Backend CORS | Allows `*` — safe because port 8082 is internal-only; only Next.js calls it |

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

**Postgres** (local)
```bash
docker run -e POSTGRES_USER=publicai -e POSTGRES_PASSWORD=publicai_dev \
  -e POSTGRES_DB=publicai_foundry -p 5432:5432 postgres:16-alpine

# Create the users DB:
psql -U publicai -h localhost publicai_foundry \
  -c "CREATE DATABASE publicai_users;"
```

---

## Model Support

| Provider | Models | Notes |
|---|---|---|
| **Mistral AI** | `mistral-large-latest`, `mistral-small-latest`, `open-mistral-7b` | Cloud API, recommended |
| **Ollama** | Any model you run locally | Set `OLLAMA_BASE_URL`, select in playground |

---

## License

This project was built for the [Mistral AI Hackathon 2026](https://mistral.ai).

---

<p align="center">
  <sub>Built with ❤️ for the public good · Powered by Mistral AI · Made in Sydney 🇦🇺</sub>
</p>
