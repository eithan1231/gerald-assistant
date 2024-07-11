import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  defaultLocation: z.string(),

  locations: z.array(
    z.object({
      name: z.string(),
      connector: z.object({
        type: z.enum(["prometheus"]),
        series: z.record(z.string()),
        gauge: z.string(),
      }),
    })
  ),
});

let cachedConfig: z.infer<typeof ConfigSchema>;

export const getWeatherConfig = async () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const contentRaw = await readFile("./config/weather.yaml", "utf-8");

  const contentParsed = parseYaml(contentRaw);

  const contentValidated = await ConfigSchema.parseAsync(contentParsed);

  if (
    !contentValidated.locations.find(
      (location) => location.name === contentValidated.defaultLocation
    )
  ) {
    throw new Error(
      "Default location is not valid, " + contentValidated.defaultLocation
    );
  }

  cachedConfig = contentValidated;

  return contentValidated;
};
