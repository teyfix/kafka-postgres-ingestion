import { Kafka, type Producer } from "kafkajs";
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
type CreateMetricMessage = {
  key: string;
  value: CreateMetric;
};

// ============================================================================
// Metric Generation
// ============================================================================
function generateDeviceIds(count: number): string[] {
  return fakey.helpers.multiple(() => fakey.string.uuid(), { count });
}

function generateMetric(deviceId: string): CreateMetricMessage {
  return {
    key: deviceId,
    value: {
      device_id: deviceId,
      metric_name: fakey.helpers.arrayElement(metricNames),
      published_at: fakey.date.recent(),
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

async function sendMetricBatch(
  producer: Producer,
  metrics: CreateMetricMessage[],
): Promise<void> {
  await producer.send({
    topic: "metrics",
    messages: metrics.map(({ key, value }) => ({
      key,
      value: JSON.stringify(value),
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
    allowAutoTopicCreation: true,
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

  const producer = await createProducer();
  const interval = await setupPublishingLoop(producer, logger);

  handleShutdown(async () => {
    logger.info("Shutting down producer...");

    clearInterval(interval);

    await producer.disconnect();

    logger.info("Producer shutdown complete");
  });
}

main().catch((err) => {
  serviceLogger.fatal(err);
  process.exit(1);
});
