import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const LifxConfigSchema = z.object({
  lights: z.array(
    z.object({
      name: z.string(),
      deviceLabel: z.string(),
    })
  ),

  commands: z.array(
    z.object({
      name: z.string(),
      lights: z.array(z.string()),
    })
  ),
});

let cachedConfig: z.infer<typeof LifxConfigSchema>;

export const getLifxConfig = async () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const contentRaw = await readFile("./config/lifx.yaml", "utf-8");

  const contentParsed = parseYaml(contentRaw);

  const contentValidated = await LifxConfigSchema.parseAsync(contentParsed);

  for (const command of contentValidated.commands) {
    for (const commandLight of command.lights) {
      if (
        !contentValidated.lights.find(
          (light) => light.deviceLabel === commandLight
        )
      ) {
        throw new Error("Command has invalid light " + commandLight);
      }
    }
  }

  cachedConfig = contentValidated;

  return contentValidated;
};
