import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  endpoint: z.string(),
});

let cachedConfig: z.infer<typeof ConfigSchema>;

export const getPrometheusConfig = async () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const contentRaw = await readFile("./config/prometheus.yaml", "utf-8");

  const contentParsed = parseYaml(contentRaw);

  const contentValidated = await ConfigSchema.parseAsync(contentParsed);

  cachedConfig = contentValidated;

  return contentValidated;
};
