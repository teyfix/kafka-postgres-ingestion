import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ServerConfig } from "../config/server-config";

export const pool = new Pool({
  connectionString: ServerConfig.POSTGRES_URL,
});

export const db = drizzle({
  client: pool,
});
