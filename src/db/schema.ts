import * as d from "drizzle-orm/pg-core";

/**
 * Define the schema
 */
export const schema = d.pgSchema("concept");

/**
 * So I can use it with z.enum(...) somewhere else
 */
export const metricNames = [
  "temperature",
  "humidity",
  "pressure",
  "co2",
  "light",
  "sound",
] as const;

/**
 * Define as enum to store less space
 */
export const metricName = schema.enum("metric_name", metricNames);

/**
 * Devices
 */
export const devices = schema.table("devices", {
  id: d.uuid().primaryKey().defaultRandom(),
  label: d.text().notNull(),
  location: d.text(),
});

/**
 * Metrics - optimized for high-throughput ingestion
 */
export const metrics = schema.table(
  "metrics",
  {
    device_id: d.uuid().notNull(),
    published_at: d.timestamp().notNull(),
    metric_name: metricName().notNull(),
    value: d.doublePrecision().notNull(),
    tags: d.text().array().notNull().default([]),
    created_at: d.timestamp().defaultNow().notNull(),
  },
  (t) => [
    // Composite PK distributes writes across the index tree
    d.primaryKey({ columns: [t.device_id, t.published_at, t.metric_name] }),

    // For queries like: "show me all temperature readings in the last hour"
    d.index("metric_name_time_idx").on(t.metric_name, t.published_at),
  ],
);
