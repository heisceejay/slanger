import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required for drizzle-kit");
}

export default defineConfig({
  schema: "./packages/api-gateway/src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
});
