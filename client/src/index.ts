import { hostname } from "os";
import { Client } from "./client.js";

const getEnv = (name: string, defaultValue: string) => {
  if (process.env[name]) {
    return process.env[name];
  }

  return defaultValue;
};

const getEnvAsNumber = (name: string, defaultValue: string) => {
  const value = Number(getEnv(name, defaultValue));

  if (isNaN(value)) {
    return Number(defaultValue);
  }

  return value;
};

const getEnvAsBoolean = (name: string, defaultValue: string) => {
  return getEnv(name, defaultValue) === "true";
};

const main = async () => {
  const clientName = getEnv("CLIENT_NAME", hostname());

  const endpoint = getEnv("ENDPOINT", "ws://localhost:3000/");

  const speakerInterface = getEnv("SPEAKER_INTERFACE", "") ?? undefined;
  const speakerChannels = getEnvAsNumber("SPEAKER_CHANNELS", "2") ?? 2;

  const microphoneInactivityFlush = getEnvAsNumber(
    "MICROPHONE_INACTIVITY_FLUSH",
    "2.2"
  );

  const microphoneFfmpegAlsaInterface = getEnv(
    "FFMPEG_ALSA_INTERFACE",
    "hw:0,0"
  );

  const microphoneFfmpegAlsaChannels = getEnvAsNumber(
    "FFMPEG_ALSA_CHANNELS",
    "2"
  );

  const microphoneFfmpegFilterVolume = getEnvAsNumber(
    "FFMPEG_FILTER_VOLUME",
    "1"
  );

  const microphoneFfmpegFilterEnabled = getEnvAsBoolean(
    "FFMPEG_FILTER",
    "true"
  );

  if (microphoneInactivityFlush < 0.2) {
    throw new Error(
      "MICROPHONE_INACTIVITY_FLUSH is below 0.2 seconds (200 milliseconds)"
    );
  }

  if (microphoneInactivityFlush > 10) {
    throw new Error("MICROPHONE_INACTIVITY_FLUSH is above 10 seconds");
  }

  if (speakerChannels <= 0 || speakerChannels >= 32) {
    throw new Error("SPEAKER_CHANNELS must be between or equal to 1 and 32");
  }

  const client = new Client({
    name: clientName,
    endpoint,
    microphoneInactivityFlush,
    microphoneFfmpegAlsaInterface,
    microphoneFfmpegAlsaChannels,
    microphoneFfmpegFilterVolume,
    microphoneFfmpegFilterEnabled,
    speakerInterface,
    speakerChannels,
  });

  await client.start();
};

main();
