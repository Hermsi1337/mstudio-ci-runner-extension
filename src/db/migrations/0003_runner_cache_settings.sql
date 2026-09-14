ALTER TABLE "runners" ADD COLUMN "cache" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "cacheSizeGb" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
UPDATE "runners" SET "cache" = true WHERE "cronjobIds" <> '[]';
