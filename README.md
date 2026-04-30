# Slanger

AI-assisted constructed language (conlang) generator. Design phoneme inventories, morphological paradigms, vocabulary, and corpus samples — powered by the **OpenRouter API**.

**Architecture:** Stateless API (Node 22 · Fastify · TypeScript) + React SPA (Vite). Language data lives entirely in browser `sessionStorage` and is cleared when the tab closes. No accounts, no database.

**Stack:** Node 22 · TypeScript · Fastify · Vite · React 18 · **OpenRouter API** · Docker · Railway · Vercel

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
├── railway.toml            # Railway deployment config
└── .github/workflows/      # CI pipeline
```

---

## Quick start (local)

### Prerequisites

- Node 22+  
- An **OpenRouter API key** (get one at [openrouter.ai/keys](https://openrouter.ai/keys))

### Run

```bash
# 1. Clone and install
git clone https://github.com/your-org/slanger
cd slanger
npm install

# 2. Configure the API gateway
cd packages/api-gateway
printf "OPENROUTER_API_KEY=sk-or-v1-...\n" > .env
# Edit .env — set OPENROUTER_API_KEY (from OpenRouter)

# 3. Start the backend (from repo root)
cd ../..
npm run dev

# 4. Start the frontend (separate terminal)
npm run dev:frontend   # or: cd packages/frontend && npm run dev
```

Open http://localhost:5173.

### Environment variables

Only `OPENROUTER_API_KEY` is required. All others have defaults.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | ✓ | — | OpenRouter API key from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | — | `anthropic/claude-3-haiku` | Model (use any OpenRouter model id) |
| `PORT` | — | `3001` | API server port |
| `REDIS_URL` | — | _(none)_ | If set, rate limiting uses Redis; otherwise in-memory |
| `RATE_LIMIT_MAX` | — | `100` | Max requests per time window per IP |
| `RATE_LIMIT_WINDOW_MS` | — | `60000` | Rate limit window in ms |
| `NODE_ENV` | — | `development` | Set to `production` for prod |

**OpenRouter API:** Get your key at [openrouter.ai/keys](https://openrouter.ai/keys).

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

### Railway (backend)

The API gateway deploys to [Railway](https://railway.app) using the Dockerfile.

1. Create a new Railway project and connect this repo
2. Set the root directory to `/` and Railway will use `railway.toml` for config
3. Add environment variables in the Railway dashboard:

```
OPENROUTER_API_KEY=sk-or-v1-...
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
```

4. Optionally add a Redis service for rate limiting and set `REDIS_URL`
5. Deploy — Railway auto-builds from the Dockerfile

### Vercel (frontend)

The React SPA deploys to [Vercel](https://vercel.com) from source.

1. Import the repo in Vercel
2. Set the root directory to `packages/frontend`
3. Vercel auto-detects Vite — no build config needed
4. Set the `VITE_API_URL` environment variable to your Railway backend URL
5. Deploy

### Docker Compose (self-hosted)

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Set secrets
export OPENROUTER_API_KEY="sk-or-v1-..."

# Start
docker compose -f docker-compose.prod.yml up -d
```

The compose file starts:
- `api-gateway` on port 3001
- `frontend` (nginx serving built React app) on port 80
- nginx reverse proxy routing `/v1/` → api-gateway

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
| `GET  /health/ready` | Readiness check (OpenRouter key configured) |
| `GET  /docs` | OpenAPI/Swagger UI |

---

## LLM orchestration

`llm-orchestrator` wraps all OpenRouter API calls:

- **Validation-gated retry** — each operation runs up to 3 attempts; failed validation produces a structured error message injected into the next attempt's prompt
- **In-memory response cache** — identical requests skip the LLM entirely; TTLs from 5 min (corpus) to 30 days (explain-rule)
- **Streaming** — corpus generation streams SSE tokens to the client in real time
- **Autonomous pipeline** — chains all 5 ops in dependency order, emitting SSE progress events throughout

**Model:** Default is `anthropic/claude-3-haiku`. Set `OPENROUTER_MODEL` to your preferred model string (e.g. `openai/gpt-4o-mini`).

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
