-- hand-authored: extensions drizzle-kit cannot infer (idempotent; also created by docker initdb locally)
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('KO', 'EN', 'JA', 'ZH');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'CURATOR', 'MODERATOR', 'ADMIN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"locale" "locale" DEFAULT 'KO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "region" (
	"code" varchar(10) PRIMARY KEY NOT NULL,
	"name_ko" text NOT NULL,
	"name_en" text,
	"name_ja" text,
	"name_zh" text,
	"parent_code" varchar(10),
	"boundary" geometry(MultiPolygon,4326),
	"is_declining_pop" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
-- hand-authored: GIST index for point-in-polygon containment (ST_Contains) — drizzle-kit cannot infer
CREATE INDEX IF NOT EXISTS "region_boundary_gist" ON "region" USING gist ("boundary");
