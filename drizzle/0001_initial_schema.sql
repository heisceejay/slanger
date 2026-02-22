-- ── Slanger: Initial Schema Migration ─────────────────────────────────────────
-- Run: npm run db:migrate
-- Idempotent: all statements use IF NOT EXISTS

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL,
  username          TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  password_hash     TEXT,                          -- NULL for OAuth accounts
  refresh_token_hash TEXT,
  provider          TEXT NOT NULL DEFAULT 'email',
  provider_sub      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx    ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- ── projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);

-- ── languages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS languages (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  world      TEXT,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  version    INTEGER NOT NULL DEFAULT 1,
  definition JSONB NOT NULL,
  has_errors BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS languages_owner_idx   ON languages(owner_id);
CREATE INDEX IF NOT EXISTS languages_project_idx ON languages(project_id);
CREATE INDEX IF NOT EXISTS languages_name_idx    ON languages(name);
-- GIN index on tags array for fast tag filtering
CREATE INDEX IF NOT EXISTS languages_tags_idx    ON languages USING GIN(tags);
-- GIN index on definition JSONB for future semantic queries
CREATE INDEX IF NOT EXISTS languages_definition_gin ON languages USING GIN(definition jsonb_path_ops);

-- ── language_versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS language_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id   TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  definition    JSONB NOT NULL,
  change_reason TEXT NOT NULL DEFAULT 'user-edit',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS language_versions_lang_ver_idx
  ON language_versions(language_id, version);
CREATE INDEX IF NOT EXISTS language_versions_language_idx
  ON language_versions(language_id);

-- ── api_keys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  key_hash            TEXT NOT NULL,
  key_prefix          TEXT NOT NULL,
  scopes              TEXT[] NOT NULL,
  daily_request_limit INTEGER DEFAULT 500,
  last_used_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX  IF NOT EXISTS api_keys_owner_idx    ON api_keys(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash);
-- Partial index: only active keys are queried
CREATE INDEX  IF NOT EXISTS api_keys_active_idx   ON api_keys(key_hash)
  WHERE revoked_at IS NULL;

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at    ON users;
DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
DROP TRIGGER IF EXISTS languages_set_updated_at ON languages;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER languages_set_updated_at
  BEFORE UPDATE ON languages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
