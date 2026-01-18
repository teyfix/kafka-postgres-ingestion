CREATE SCHEMA "concept";

--> statement-breakpoint
CREATE TYPE "concept"."metric_name" AS ENUM(
	'temperature',
	'humidity',
	'pressure',
	'co2',
	'light',
	'sound'
);

--> statement-breakpoint
CREATE TABLE
	"concept"."devices" (
		"id" UUID PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
		"label" TEXT NOT NULL,
		"location" TEXT
	);

--> statement-breakpoint
CREATE TABLE
	"concept"."metrics" (
		"device_id" UUID NOT NULL,
		"published_at" TIMESTAMP NOT NULL,
		"metric_name" "concept"."metric_name" NOT NULL,
		"value" DOUBLE PRECISION NOT NULL,
		"tags" TEXT[] DEFAULT '{}' NOT NULL,
		"created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
		CONSTRAINT "metrics_device_id_published_at_metric_name_pk" PRIMARY KEY ("device_id", "published_at", "metric_name")
	);

--> statement-breakpoint
CREATE INDEX "metric_name_time_idx" ON "concept"."metrics" USING btree ("metric_name", "published_at");