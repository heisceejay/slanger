# Slanger

AI-assisted constructed language (conlang) generator. Design phoneme inventories, morphological paradigms, vocabulary, and corpus samples — powered by the **Gemini API** (Gemini 1.5 Flash).

**Architecture:** Stateless API (Node 22 · Fastify · TypeScript) + React SPA (Vite). Language data lives entirely in browser `sessionStorage` and is cleared when the tab closes. No accounts, no database.

**Stack:** Node 22 · TypeScript · Fastify · Vite · React 18 · **Gemini API** · Docker · Fly.io

---

## Project structure

```
slanger/
├── packages/
│   ├── api-gateway/        # Fastify backend — stateless LLM proxy
│   ├── frontend/           # React SPA — all data in sessionStorage
│   ├── llm-orchestrator/   # 6 LLM operations, retry/cache/pipeline
│   ├── shared-types/       # Language schema (LanguageDefinition)
│   ├── phonology/          # Phonology validation module
│   ├── morphology/         # Morphology validation module
│   ├── syntax/             # Syntax validation module
│   ├── lexicon/            # Lexicon validation + vocabulary slots
│   └── validation/         # Cross-module validation engine
├── docker/                 # Dockerfiles + nginx config
├── fly.toml                # Fly.io deployment manifest
└── .github/workflows/      # CI pipeline
```

---

## Quick start (local)

### Prerequisites

- Node 22+  
- A **Gemini API key** (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey))

### Run

```bash
# 1. Clone and install
git clone https://github.com/your-org/slanger
cd slanger
npm install

# 2. Configure the API gateway
cd packages/api-gateway
cp .env.example .env
# Edit .env — set GEMINI_API_KEY (free key from Google AI Studio)

# 3. Start the backend (from repo root)
cd ../..
npm run dev

# 4. Start the frontend (separate terminal)
npm run dev:frontend   # or: cd packages/frontend && npm run dev
```

Open http://localhost:5173.

### Environment variables

Only `GEMINI_API_KEY` is required. All others have defaults.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✓ | — | Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | — | `gemini-1.5-flash` | Model (e.g. `gemini-2.5-flash` for higher capacity) |
| `PORT` | — | `3001` | API server port |
| `REDIS_URL` | — | _(none)_ | If set, rate limiting uses Redis; otherwise in-memory |
| `RATE_LIMIT_MAX` | — | `100` | Max requests per time window per IP |
| `RATE_LIMIT_WINDOW_MS` | — | `60000` | Rate limit window in ms |
| `NODE_ENV` | — | `development` | Set to `production` for prod |

**Gemini free tier:** Gemini 1.5 Flash is free, fast, and has immense context limits. Get your key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

---

## Running tests

```bash
# Build shared packages first (ordered build)
npm run build

# Run all tests
npm test

# Individual suites
cd packages/validation && npm test           # validation tests
cd packages/llm-orchestrator && npm test      # LLM operation tests (mocked, no network)
```

---

## Production deployment

### Docker Compose (self-hosted)

```bash
# Build images
docker compose -f docker/docker-compose.prod.yml build

# Set secrets
export GEMINI_API_KEY="AIzaSy_..."

# Start
docker compose -f docker/docker-compose.prod.yml up -d
```

The compose file starts:
- `api-gateway` on port 3001
- `frontend` (nginx serving built React app) on port 80
- nginx reverse proxy routing `/v1/` → api-gateway

### Fly.io

```bash
# First time
flyctl launch --no-deploy

# Set required secret
flyctl secrets set GEMINI_API_KEY="AIzaSy_..."

# Optional: Redis-backed rate limiting
flyctl secrets set REDIS_URL="redis://..."

# Deploy
flyctl deploy --config fly.toml

# Verify
curl https://slanger-api.fly.dev/health/ready
```

---

## API reference

All LLM routes are `POST` and expect a full `LanguageDefinition` in the request body. They return `{ data: { language: LanguageDefinition, ... }, requestId }`. No authentication required.

| Route | Description |
|---|---|
| `POST /v1/suggest-inventory` | Suggests a phoneme inventory |
| `POST /v1/fill-paradigms` | Fills morphological paradigm tables |
| `POST /v1/generate-lexicon` | Generates a batch of lexical entries |
| `POST /v1/generate-corpus` | Generates interlinear corpus samples |
| `POST /v1/explain-rule` | Explains a linguistic rule in plain English |
| `POST /v1/check-consistency` | Audits cross-module linguistic consistency |
| `POST /v1/autonomous` | SSE stream: runs all 5 pipeline steps in sequence |
| `GET  /health` | Liveness check |
| `GET  /health/ready` | Readiness check (LLM key configured) |
| `GET  /docs` | OpenAPI/Swagger UI |

---

## LLM orchestration

`llm-orchestrator` wraps all LLM API calls:

- **Validation-gated retry** — each operation runs up to 3 attempts; failed validation produces a structured error message injected into the next attempt's prompt
- **In-memory response cache** — identical requests skip the LLM entirely; TTLs from 5 min (corpus) to 30 days (explain-rule)
- **Streaming** — corpus generation streams SSE tokens to the client in real time
- **Autonomous pipeline** — chains all 5 ops in dependency order, emitting SSE progress events throughout

**Model:** Default is `gemini-1.5-flash`. Set `GEMINI_MODEL` to override.

---

## Language schema

The core data model is `LanguageDefinition` in `packages/shared-types/src/schema.ts`. Top-level sections:

| Field | Description |
|---|---|
| `meta` | Name, tags, preset, version, timestamps |
| `phonology` | Inventory (consonants/vowels/tones), phonotactics, orthography, suprasegmentals |
| `morphology` | Typology, categories, paradigm tables, derivational/alternation rules |
| `syntax` | Word order, alignment, phrase structure, clause types |
| `lexicon` | Array of `LexicalEntry` (form, IPA, POS, glosses, semantic fields) |
| `corpus` | Array of `CorpusSample` (text, IPA, translation, interlinear gloss) |
| `validationState` | Last validation run: errors and warnings by module |

---

## Development notes

### Adding a new LLM operation

1. Add types to `packages/llm-orchestrator/src/types.ts`
2. Add prompt builders in `packages/llm-orchestrator/src/prompts/`
3. Add the operation function in `packages/llm-orchestrator/src/operations.ts`
4. Expose it from `packages/llm-orchestrator/src/index.ts`
5. Add a route in `packages/api-gateway/src/routes/llm.routes.ts`
6. Add the API function and fetch call in `packages/frontend/src/lib/api.ts`

### Adding a validation rule

Add to the relevant module in `packages/phonology/`, `packages/morphology/`, or `packages/syntax/`, then register the rule in `packages/validation/src/index.ts`. Run `npm test` in `packages/validation/` to confirm.

---

## License

MIT
