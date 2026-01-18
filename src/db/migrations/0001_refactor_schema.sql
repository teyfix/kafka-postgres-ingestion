ALTER TYPE "concept"."metric_name" SET SCHEMA "public";--> statement-breakpoint
ALTER TABLE "concept"."devices" SET SCHEMA "public";
--> statement-breakpoint
ALTER TABLE "concept"."metrics" SET SCHEMA "public";
--> statement-breakpoint
DROP SCHEMA "concept";
