import type { TransportTargetOptions } from "pino";
import pino from "pino";
import { ServerConfig } from "./server-config";

function getTargets(): TransportTargetOptions[] {
  if (ServerConfig.DOCKER) {
    return [
      {
        target: "pino/file",
        level: "error",
        options: {
          destination: 2, // stderr
        },
      },
      {
        target: "pino/file",
        level: "trace",
        options: {
          destination: 1, // stdout
        },
      },
    ];
  }

  return [
    {
      target: "pino-pretty",
      level: "trace",
    },
  ];
}

export const appLogger = pino(
  {
    transport: {
      targets: getTargets(),
    },
  },
  pino.destination(),
);
