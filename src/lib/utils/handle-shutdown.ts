import { appLogger } from "../../config/logger";
import type { MaybePromise } from "../../types/shared";

const signals = ["SIGTERM", "SIGINT"] as const;

export function handleShutdown(fn: () => MaybePromise<void>) {
  const logger = appLogger.child({ module: "handleShutdown" });
  let isShuttingDown = false;

  for (const signal of signals) {
    process.on(signal, async () => {
      // Prevent multiple shutdown attempts
      if (isShuttingDown) {
        logger.warn("Already shutting down, ignoring signal %s", signal);
        return;
      }

      isShuttingDown = true;
      logger.info("Received %s, shutting down gracefully...", signal);

      try {
        // Set a hard timeout to force exit if cleanup takes too long
        const timeout = setTimeout(() => {
          logger.error("Shutdown timeout exceeded, forcing exit");
          process.exit(1);
        }, 30000); // 30 second timeout

        await fn();

        clearTimeout(timeout);
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error(err, "Error during shutdown");
        process.exit(1);
      }
    });
  }

  // Handle uncaught exceptions and rejections
  process.on("uncaughtException", (err) => {
    logger.fatal(err, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason, promise }, "Unhandled rejection");
    process.exit(1);
  });
}
