import * as d from "drizzle-orm/pg-core";

/**
 * So I can use it with z.enum(...) somewhere else
 */
export enum MetricName {
  temperature = 0,
  humidity = 10,
  pressure = 20,
  co2 = 30,
  light = 40,
  sound = 50,
}

export const metricNames = Object.values(MetricName).filter(
  (val) => typeof val === "number",
);

/**
 * Devices
 */
export const devices = d.pgTable("devices", {
  id: d.uuid().primaryKey().defaultRandom(),
  label: d.text().notNull(),
  location: d.text(),
});

/**
 * Metrics - optimized for high-throughput ingestion
 */
export const metrics = d.pgTable(
  "metrics",
  {
    device_id: d.uuid().notNull(),
    published_at: d.timestamp().notNull(),
    metric_name: d.smallint().notNull(),
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
