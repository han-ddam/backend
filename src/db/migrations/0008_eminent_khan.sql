CREATE TYPE "public"."agreement_type" AS ENUM('TOS', 'PRIVACY', 'CONTENT_LICENSE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agreement_trans" (
	"agreement_id" uuid NOT NULL,
	"locale" "locale" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "agreement_trans_agreement_id_locale_pk" PRIMARY KEY("agreement_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agreement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "agreement_type" NOT NULL,
	"version" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_type_version_uq" UNIQUE("type","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_agreement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_agreement_uq" UNIQUE("user_id","agreement_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agreement_trans" ADD CONSTRAINT "agreement_trans_agreement_id_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreement"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_agreement" ADD CONSTRAINT "user_agreement_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_agreement" ADD CONSTRAINT "user_agreement_agreement_id_agreement_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreement"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
