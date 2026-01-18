import { createInsertSchema } from "drizzle-zod";
import type z from "zod";
import { devices, metrics } from "./schema";

/**
 * Zod schema for devices
 */
export const CreateDeviceDomain = createInsertSchema(devices);

export type CreateDevice = z.infer<typeof CreateDeviceDomain>;

/**
 * Zod schema for metrics
 */
export const CreateMetricDomain = createInsertSchema(metrics);

export type CreateMetric = z.infer<typeof CreateMetricDomain>;
