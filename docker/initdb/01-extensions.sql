-- Runs once on first DB init (mounted into /docker-entrypoint-initdb.d).
-- These extensions are load-bearing for han-ddam and drizzle-kit will NOT create them.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
