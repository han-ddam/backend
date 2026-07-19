CREATE TYPE "public"."score_event_type" AS ENUM('VISIT', 'PHOTO');--> statement-breakpoint
ALTER TABLE "score_event" ADD COLUMN "type" "score_event_type" DEFAULT 'PHOTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "score_event" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "score_event" DROP CONSTRAINT "score_event_user_place_uq";
