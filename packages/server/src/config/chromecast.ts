import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ChromecastConfigSchema = z.object({
  devices: z.array(
    z.object({
      name: z.string(),
      deviceName: z.string(),
      deviceIp: z.string(),
      commands: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          action: z.string(),
        })
      ),
    })
  ),
});

let cachedConfig: z.infer<typeof ChromecastConfigSchema>;

export const getChromecastConfig = async () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const contentRaw = await readFile("./config/chromecast.yaml", "utf-8");

  const contentParsed = parseYaml(contentRaw);

  const contentValidated = await ChromecastConfigSchema.parseAsync(
    contentParsed
  );

  cachedConfig = contentValidated;

  return contentValidated;
};
