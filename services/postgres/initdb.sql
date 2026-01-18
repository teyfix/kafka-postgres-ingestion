-- Create database
CREATE DATABASE "poc_ingest";

-- Connect to the new database
\c poc_ingest
-- Create users if they don't exist (avoid errors on restart)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'pgadmin') THEN
    CREATE USER "pgadmin" WITH PASSWORD 'supersecret';
  END IF;
  
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'nodejs') THEN
    CREATE USER "nodejs" WITH PASSWORD 'supersecret';
  END IF;
END
$$;

-- Grant database privileges
GRANT ALL PRIVILEGES ON DATABASE "poc_ingest" TO "pgadmin";

GRANT CONNECT ON DATABASE "poc_ingest" TO "nodejs";

-- Grant schema permissions for public schema
GRANT USAGE ON SCHEMA "public" TO "nodejs";

-- Grant create privileges on the database
GRANT CREATE ON DATABASE "poc_ingest" TO "nodejs";

GRANT USAGE, CREATE ON SCHEMA "concept" TO "nodejs";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "nodejs";

GRANT USAGE,
SELECT
  ON ALL SEQUENCES IN SCHEMA "public" TO "nodejs";

-- Grant schema permissions for concept schema
GRANT USAGE ON SCHEMA "concept" TO "nodejs";

GRANT
SELECT
,
  INSERT,
UPDATE,
DELETE ON ALL TABLES IN SCHEMA "concept" TO "nodejs";

GRANT USAGE,
SELECT
  ON ALL SEQUENCES IN SCHEMA "concept" TO "nodejs";

-- Make future tables accessible to nodejs in both schemas
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
GRANT
SELECT
,
  INSERT,
UPDATE,
DELETE ON TABLES TO "nodejs";

ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
GRANT USAGE,
SELECT
  ON SEQUENCES TO "nodejs";

ALTER DEFAULT PRIVILEGES IN SCHEMA "concept"
GRANT
SELECT
,
  INSERT,
UPDATE,
DELETE ON TABLES TO "nodejs";

ALTER DEFAULT PRIVILEGES IN SCHEMA "concept"
GRANT USAGE,
SELECT
  ON SEQUENCES TO "nodejs";