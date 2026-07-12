CREATE TYPE "public"."badge_criteria_type" AS ENUM('LEVEL', 'VISIT_COUNT');--> statement-breakpoint
CREATE TYPE "public"."badge_status" AS ENUM('ACTIVE', 'HIDDEN');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge_trans" (
	"badge_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "badge_trans_badge_id_locale_pk" PRIMARY KEY("badge_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"tier" integer NOT NULL,
	"criteria_type" "badge_criteria_type" NOT NULL,
	"criteria_value" integer NOT NULL,
	"icon_key" text,
	"status" "badge_status" DEFAULT 'ACTIVE' NOT NULL,
	"seq" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_badge" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badge_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "badge_trans" ADD CONSTRAINT "badge_trans_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_badge" ADD CONSTRAINT "user_badge_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_badge_user_idx" ON "user_badge" USING btree ("user_id");