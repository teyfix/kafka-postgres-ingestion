import { Kafka, type Admin, type Producer } from "kafkajs";
import _ from "lodash";
import PQueue from "p-queue";
import { appLogger } from "../config/logger";
import { ProducerConfig } from "../config/producer-config";
import { ServerConfig } from "../config/server-config";
import type { CreateMetric } from "../db/domains";
import { metricNames } from "../db/schema";
import { fakey } from "../lib/faker";
import { handleShutdown } from "../lib/utils/handle-shutdown";

const serviceLogger = appLogger.child({ service: "producer" });

// ============================================================================
// Types
// ============================================================================
/**
 * This is the key used to identify a metric.
 * Derived from compound unique index on device_id, metric_name, and published_at
 */
type MetricKey = Pick<
  CreateMetric,
  "device_id" | "published_at" | "metric_name"
>;

/**
 * Now we infer the value by omitting the compound key
 */
type MetricValue = Omit<CreateMetric, keyof MetricKey>;

type CreateMetricMessage = {
  key: MetricKey;
  value: MetricValue;
};

// ============================================================================
// Metric Generation
// ============================================================================
function generateDeviceIds(count: number): string[] {
  return fakey.helpers.multiple(() => fakey.string.uuid(), { count });
}

function generateMetric(deviceId: string): CreateMetricMessage {
  return {
    key: {
      device_id: deviceId,
      metric_name: fakey.helpers.arrayElement(metricNames),
      published_at: fakey.date.recent(),
    },
    value: {
      value: fakey.number.float({ min: 0, max: 100 }),
      tags: fakey.lorem.words({ min: 3, max: 7 }).split(" "),
    },
  };
}

function generateMetricBatch(
  deviceIds: string[],
  count: number,
): CreateMetricMessage[] {
  const metrics: CreateMetricMessage[] = [];

  for (let i = 0; i < count; i++) {
    const deviceId = fakey.helpers.arrayElement(deviceIds);
    metrics.push(generateMetric(deviceId));
  }

  return metrics;
}

// ============================================================================
// Kafka Operations
// ============================================================================

const MetricKeySchema = {
  type: "struct",
  optional: false,
  fields: [
    { field: "device_id", type: "string", optional: false },
    {
      field: "metric_name",
      type: "int16",
      optional: false,
    },
    {
      field: "published_at",
      type: "int64",
      name: "org.apache.kafka.connect.data.Timestamp",
      optional: false,
    },
  ],
};

const MetricValueSchema = {
  type: "struct",
  optional: false,
  fields: [
    { field: "value", type: "float", optional: false },
    {
      field: "tags",
      type: "array",
      optional: false,
      items: { type: "string", optional: false },
    },
  ],
};

async function ensureTopicExists(
  admin: Admin,
  logger: typeof serviceLogger,
): Promise<void> {
  const topicName = "metrics";
  const numPartitions = ProducerConfig.TOPIC_PARTITIONS ?? 3;
  const replicationFactor = ProducerConfig.TOPIC_REPLICATION_FACTOR ?? 1;

  try {
    const topics = await admin.listTopics();

    if (topics.includes(topicName)) {
      logger.info("Topic '%s' already exists", topicName);

      // Optionally check and update partition count
      const metadata = await admin.fetchTopicMetadata({ topics: [topicName] });
      const currentPartitions = metadata.topics[0]?.partitions.length ?? 0;

      if (currentPartitions < numPartitions) {
        logger.info(
          "Updating topic '%s' partitions from %d to %d",
          topicName,
          currentPartitions,
          numPartitions,
        );
        await admin.createPartitions({
          topicPartitions: [
            {
              topic: topicName,
              count: numPartitions,
            },
          ],
        });
      }

      return;
    }

    logger.info(
      "Creating topic '%s' with %d partitions and replication factor %d",
      topicName,
      numPartitions,
      replicationFactor,
    );

    await admin.createTopics({
      topics: [
        {
          topic: topicName,
          numPartitions,
          replicationFactor,
          configEntries: [
            {
              name: "cleanup.policy",
              value: "delete",
            },
            {
              name: "retention.ms",
              value: String(ProducerConfig.TOPIC_RETENTION_MS),
            },
            {
              name: "compression.type",
              value: "snappy",
            },
          ],
        },
      ],
      waitForLeaders: true,
    });

    logger.info("Topic '%s' created successfully", topicName);
  } catch (error) {
    logger.error({ error }, "Failed to ensure topic exists");
    throw error;
  }
}

async function sendMetricBatch(
  producer: Producer,
  metrics: CreateMetricMessage[],
): Promise<void> {
  await producer.send({
    topic: "metrics",
    messages: metrics.map((metric) => ({
      key: JSON.stringify({
        schema: MetricKeySchema,
        payload: {
          device_id: metric.key.device_id,
          metric_name: metric.key.metric_name,
          published_at: metric.key.published_at.getTime(),
        },
      }),
      value: JSON.stringify({
        schema: MetricValueSchema,
        payload: {
          value: metric.value.value,
          tags: metric.value.tags,
        },
      }),
    })),
  });
}

function publishMetrics(
  producer: Producer,
  queue: PQueue,
  logger: typeof serviceLogger,
): void {
  const metricsCount = fakey.number.int({
    min: ProducerConfig.MIN_METRICS,
    max: ProducerConfig.MAX_METRICS,
  });

  const deviceCount = fakey.number.int({
    min: ProducerConfig.MIN_DEVICES,
    max: ProducerConfig.MAX_DEVICES,
  });

  const deviceIds = generateDeviceIds(deviceCount);
  const metrics = generateMetricBatch(deviceIds, metricsCount);
  const batches = _.chunk(metrics, ProducerConfig.KAFKA_BATCH_SIZE);

  logger.info(
    "Producing %d metrics across %d devices in %d batches",
    metricsCount,
    deviceCount,
    batches.length,
  );

  for (const batch of batches) {
    queue.add(() => sendMetricBatch(producer, batch));
  }
}

// ============================================================================
// Producer Lifecycle
// ============================================================================

async function createProducer(): Promise<Producer> {
  const kafka = new Kafka({
    brokers: [ServerConfig.KAFKA_URL],
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: false, // We handle this explicitly
    maxInFlightRequests: ProducerConfig.KAFKA_MAX_IN_FLIGHT,
  });

  await producer.connect();

  return producer;
}

async function setupPublishingLoop(
  producer: Producer,
  logger: typeof serviceLogger,
): Promise<NodeJS.Timeout> {
  const queue = new PQueue({
    concurrency: ProducerConfig.QUEUE_CONCURRENCY,
  });

  const interval = setInterval(() => {
    publishMetrics(producer, queue, logger);
  }, ProducerConfig.PUBLISH_INTERVAL);

  return interval;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const logger = serviceLogger.child({ module: "main" });

  logger.info("Starting producer with config: %o", ProducerConfig);

  const kafka = new Kafka({
    brokers: [ServerConfig.KAFKA_URL],
  });

  const admin = kafka.admin();

  try {
    await admin.connect();
    await ensureTopicExists(admin, logger);
  } finally {
    await admin.disconnect();
  }

  const producer = await createProducer();
  const interval = await setupPublishingLoop(producer, logger);

  const server = Bun.serve({
    port: 3000,
    routes: {
      "/health": Response.json({ status: "ok" }),
      "/metrics": Response.json(
        { error: "not implemented" },
        { status: 501, statusText: "Not Implemented" },
      ),
    },
  });

  logger.info("Server listening on %s", server.url || "?");

  handleShutdown(async () => {
    logger.info("Shutting down producer...");

    clearInterval(interval);

    await server.stop();
    await producer.disconnect();

    logger.info("Producer shutdown complete");
  });
}

main().catch((err) => {
  serviceLogger.fatal(err);
  process.exit(1);
});
