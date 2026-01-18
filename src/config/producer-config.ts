import env from "env-var";

export const ProducerConfig = {
  // Producer queue settings
  QUEUE_CONCURRENCY: env
    .get("PRODUCER_QUEUE_CONCURRENCY")
    .default("8")
    .asIntPositive(),

  // Metric generation
  MIN_METRICS: env.get("PRODUCER_MIN_METRICS").default("2500").asIntPositive(),
  MAX_METRICS: env.get("PRODUCER_MAX_METRICS").default("7500").asIntPositive(),
  MIN_DEVICES: env.get("PRODUCER_MIN_DEVICES").default("3").asIntPositive(),
  MAX_DEVICES: env.get("PRODUCER_MAX_DEVICES").default("10").asIntPositive(),

  // Kafka batching
  KAFKA_BATCH_SIZE: env.get("KAFKA_BATCH_SIZE").default("250").asIntPositive(),
  KAFKA_MAX_IN_FLIGHT: env
    .get("KAFKA_MAX_IN_FLIGHT")
    .default("5")
    .asIntPositive(),

  // Publishing interval (ms)
  PUBLISH_INTERVAL: env
    .get("PRODUCER_PUBLISH_INTERVAL")
    .default("250")
    .asIntPositive(),

  // Topic creation
  TOPIC_PARTITIONS: env
    .get("TOPIC_PARTITIONS_METRICS")
    .default("6")
    .asIntPositive(),
  TOPIC_REPLICATION_FACTOR: env
    .get("TOPIC_REPLICATION_FACTOR_METRICS")
    .default("1")
    .asIntPositive(),
  TOPIC_RETENTION_MS: env
    .get("TOPIC_RETENTION_METRICS")
    .default("604800000")
    .asIntPositive(),
};
