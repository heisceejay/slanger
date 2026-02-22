/**
 * Slanger Database Schema — Drizzle ORM
 *
 * Tables:
 *   users            — registered user accounts
 *   projects         — grouping container for languages
 *   languages        — language index + current definition (JSONB)
 *   language_versions — append-only version history for rollback
 *   api_keys         — developer API keys for public API access
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // "user_<nanoid>"
    email: text("email").notNull(),
    /** Unique login handle (e.g. "kethanilover42") */
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    /** Argon2id hash of password; null for OAuth-only accounts */
    passwordHash: text("password_hash"),
    /** Hashed refresh token; null if no active session */
    refreshTokenHash: text("refresh_token_hash"),
    /** OAuth provider, e.g. "google", "github", "email" */
    provider: text("provider").notNull().default("email"),
    /** Provider-specific subject identifier */
    providerSub: text("provider_sub"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    usernameIdx: uniqueIndex("users_username_idx").on(table.username),
  })
);

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(), // "proj_<nanoid>"
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index("projects_owner_idx").on(table.ownerId),
  })
);

// ─── Languages ────────────────────────────────────────────────────────────────

export const languages = pgTable(
  "languages",
  {
    id: text("id").primaryKey(), // "lang_<nanoid>"
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    world: text("world"),
    /** Denormalized tags for fast filtering */
    tags: text("tags").array().notNull().default([]),
    /** Current version number */
    version: integer("version").notNull().default(1),
    /** Full LanguageDefinition JSON document */
    definition: jsonb("definition").notNull(),
    /** Snapshot of last validation run */
    hasErrors: boolean("has_errors").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index("languages_owner_idx").on(table.ownerId),
    projectIdx: index("languages_project_idx").on(table.projectId),
    nameIdx: index("languages_name_idx").on(table.name),
  })
);

// ─── Language Versions (append-only history) ─────────────────────────────────

export const languageVersions = pgTable(
  "language_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: text("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Full LanguageDefinition snapshot at this version */
    definition: jsonb("definition").notNull(),
    /** What caused this version: "user-edit", "llm-generation", "import" */
    changeReason: text("change_reason").notNull().default("user-edit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    languageVersionIdx: uniqueIndex("language_versions_lang_ver_idx").on(
      table.languageId,
      table.version
    ),
    languageIdx: index("language_versions_language_idx").on(table.languageId),
  })
);

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(), // "key_<nanoid>"
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 hash of the raw key — raw key shown once at creation */
    keyHash: text("key_hash").notNull(),
    /** Prefix for identification, e.g. "sk_live_xxxx" */
    keyPrefix: text("key_prefix").notNull(),
    /** Scopes granted, e.g. ["languages:read", "languages:write"] */
    scopes: text("scopes").array().notNull(),
    /** Optional per-day request cap */
    dailyRequestLimit: integer("daily_request_limit").default(500),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index("api_keys_owner_idx").on(table.ownerId),
    keyHashIdx: uniqueIndex("api_keys_key_hash_idx").on(table.keyHash),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Language = typeof languages.$inferSelect;
export type NewLanguage = typeof languages.$inferInsert;
export type LanguageVersion = typeof languageVersions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
