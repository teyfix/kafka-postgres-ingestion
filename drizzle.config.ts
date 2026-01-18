import { defineConfig } from "drizzle-kit";
import { ServerConfig } from "./src/config/server-config";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  dbCredentials: {
    url: ServerConfig.POSTGRES_URL,
  },
});
