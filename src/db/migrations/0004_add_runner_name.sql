ALTER TABLE "runners" ADD COLUMN "runnerName" varchar(40);--> statement-breakpoint
-- Mirrors slugify() in src/domain/runner.ts, including the two non-ASCII letters JavaScript lowercases to ASCII (U+0130, U+212A).
UPDATE "runners" SET "runnerName" = btrim(left(regexp_replace(replace(replace(translate("name", 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), chr(304), 'i' || chr(775)), chr(8490), 'k'), '[^abcdefghijklmnopqrstuvwxyz0123456789-]+', '-', 'g'), 40), '-');--> statement-breakpoint
UPDATE "runners" SET "runnerName" = left(substr("serviceName", 8), 40) WHERE "runnerName" = '' AND "serviceName" LIKE 'runner-%';--> statement-breakpoint
ALTER TABLE "runners" ALTER COLUMN "runnerName" SET NOT NULL;
