import z from "zod";
import { loadConfig } from "./utils";

export const ServerConfig = loadConfig(
  z.object({
    DOCKER: z.coerce.boolean(),
    KAFKA_URL: z.string(),
  }),
  {
    DOCKER: process.env.DOCKER,
    KAFKA_URL: process.env.KAFKA_URL,
  },
);
