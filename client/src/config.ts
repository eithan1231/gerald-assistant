import { hostname } from "os";
import { z } from "zod";

const zodBooleanCoercer = (defaultValue: boolean) => {
  return z
    .enum(["true", "false"])
    .optional()
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");
};

export const ConfigurationOptionsSchema = z.object({
  CLIENT_NAME: z.string().default(() => hostname()),

  ENDPOINT: z.string().default("ws://localhost:3000/"),

  SPEAKER_INTERFACE: z.string().nullable().default(null),
  SPEAKER_CHANNELS: z.coerce.number().min(1).max(32).nullable().default(null),

  MICROPHONE_INACTIVITY_FLUSH: z.coerce.number().min(0.2).max(10).default(2.2),
  MICROPHONE_DEBUG: zodBooleanCoercer(false),
  MICROPHONE_ALSA_INTERFACE: z.string().default("hw:0,0"),
  MICROPHONE_ALSA_CHANNELS: z.coerce.number().default(2),
  MICROPHONE_ALSA_VOLUME: z.coerce.number().min(0).max(1000).default(1),
  MICROPHONE_FILTER: zodBooleanCoercer(true),
});

export type ConfigurationOptionsSchemaType = z.infer<
  typeof ConfigurationOptionsSchema
>;

export type ConfigurationOptions = keyof ConfigurationOptionsSchemaType;

export const getConfigOption = <T extends ConfigurationOptions>(
  option: T
): ConfigurationOptionsSchemaType[T] => {
  const schema = ConfigurationOptionsSchema.shape[option];

  return schema.parse(process.env[option]) as ConfigurationOptionsSchemaType[T];
};
