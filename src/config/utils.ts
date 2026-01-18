import type { z, ZodObject } from "zod";

type ConfigValue = string | undefined;
type ConfigSchema<T> =
  T extends Array<infer R>
    ? ConfigSchema<R>
    : T extends Date | RegExp
      ? ConfigValue
      : T extends object
        ? { [P in keyof T]: ConfigSchema<T[P]> }
        : ConfigValue;

export const loadConfig = <T extends ZodObject>(
  schema: T,
  config: ConfigSchema<z.infer<T>>,
): z.infer<T> => {
  return schema.parse(config);
};
