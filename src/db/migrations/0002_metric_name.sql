ALTER TABLE "metrics" ALTER COLUMN "metric_name" SET DATA TYPE smallint USING 0;--> statement-breakpoint
DROP TYPE "public"."metric_name";