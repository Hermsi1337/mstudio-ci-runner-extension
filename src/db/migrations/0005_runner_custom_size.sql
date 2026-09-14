ALTER TABLE "runners" ADD COLUMN "tokenType" varchar(16) DEFAULT 'registration' NOT NULL;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "cpus" real;--> statement-breakpoint
ALTER TABLE "runners" ADD COLUMN "memoryMb" integer;