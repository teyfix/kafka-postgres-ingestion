import { Kafka } from "kafkajs";
import { appLogger } from "../config/logger";
import { ServerConfig } from "../config/server-config";

const serviceLogger = appLogger.child({ service: "producer" });

async function main() {
  serviceLogger.info({ ServerConfig });

  const kafka = new Kafka({
    brokers: [ServerConfig.KAFKA_URL],
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: true,
  });

  await producer.connect();

  producer.send({
    topic: "users",
    messages: [{ value: "John Doe" }, { value: "Jane Doe" }],
  });
}

main().catch((err) => {
  serviceLogger.fatal(err);
});
