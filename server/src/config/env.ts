export enum ConfigurationOptions {
  EndpointPrometheus = "ENDPOINT_PROMETHEUS",
  EndpointTts = "ENDPOINT_TTS",
  EndpointTranscribe = "ENDPOINT_TRANSCRIBE",
  WhisperModel = "WHISPER_MODEL",
  ListenWords = "LISTEN_WORDS",
  OpenAiKey = "OPENAI_KEY",
}

const optionalConfigurationOptionsDetails: Record<string, string> = {
  [ConfigurationOptions.EndpointTts]: "http://127.0.0.1:3501/api/tts",
  [ConfigurationOptions.EndpointTranscribe]:
    "http://127.0.0.1:3500/v1/audio/transcriptions",
  [ConfigurationOptions.ListenWords]: "jeff,jeffery,gerald",
  [ConfigurationOptions.WhisperModel]: "Systran/faster-whisper-base.en",
};

/**
 * Validated the integiry of the configuration based on the ConfigurationOptions enum.
 */
export const validateConfig = (): boolean => {
  const configOptions = Object.values(ConfigurationOptions);

  return configOptions.every((option) => {
    if (optionalConfigurationOptionsDetails[option]) {
      return true;
    }

    return !!process.env[option];
  });
};

/**
 * Gets a string configuration option from envinmnent variables.
 * @param option Envinmnent varialbe to fetch.
 * @returns envinmnent variable.
 */
export const getConfigOption = (option: ConfigurationOptions): string => {
  if (process.env[option]) {
    return process.env[option] ?? "";
  }

  if (optionalConfigurationOptionsDetails[option]) {
    return optionalConfigurationOptionsDetails[option];
  }

  throw new Error(`Config Manager: Option "${option}" not found.`);
};

/**
 * Gets a configuration option and automaitcally splits on `,` and trims all whitespace
 * @param option Envinmnent varialbe to fetch.
 * @returns envinmnent variable.
 */
export const getConfigOptionList = (option: ConfigurationOptions): string[] => {
  const value = getConfigOption(option);
  if (value) {
    return value.split(",").map((value) => value.trim());
  }

  throw new Error(`Config Manager: Option "${option}" not found.`);
};

/**
 * Gets a number configuration option from envinmnent variables.
 * @param option Envinmnent varialbe to fetch.
 * @returns envinmnent variable.
 */
export const getConfigOptionNumber = (option: ConfigurationOptions): number => {
  const configOption = Number(getConfigOption(option));

  if (Number.isNaN(configOption)) {
    throw new Error(`Config Manager: Option "${option}" is NaN`);
  }

  return configOption;
};

/**
 * Gets a boolean configuration option from envinmnent variables.
 * @param option Envinmnent varialbe to fetch.
 * @returns envinmnent variable.
 */
export const getConfigOptionBoolean = (
  option: ConfigurationOptions
): boolean => {
  const optionValue = getConfigOption(option);

  const truthValues = ["y", "yes", "true", "1"];

  return truthValues.includes(optionValue.toLowerCase());
};
