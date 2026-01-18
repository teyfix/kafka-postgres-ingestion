import { Kafka } from "kafkajs";
import { appLogger } from "../config/logger";
import { ServerConfig } from "../config/server-config";

const serviceLogger = appLogger.child({ service: "consumer" });

async function main() {
  const logger = serviceLogger.child({ module: "main" });

  const kafka = new Kafka({
    brokers: [ServerConfig.KAFKA_URL],
    clientId: "poc-ingest-consumer",
  });

  const consumer = kafka.consumer({ groupId: "test-group" });

  await consumer.connect();
  await consumer.subscribe({
    topics: ["users"],
    fromBeginning: false,
  });

  consumer.run({
    async eachBatch({ batch }) {
      batch.messages;
    },
  });
}
