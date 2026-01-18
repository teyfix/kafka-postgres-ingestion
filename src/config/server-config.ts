import env from "env-var";

export const ServerConfig = {
  DOCKER: env.get("DOCKER").required().default("false").asBoolStrict(),
  KAFKA_URL: env.get("KAFKA_URL").required().asString(),
  POSTGRES_URL: env.get("POSTGRES_URL").required().asUrlString(),
};
