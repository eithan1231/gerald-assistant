import { Client } from "./client.js";
import { getConfigOption } from "./config.js";

const main = async () => {
  const client = new Client({
    name: getConfigOption("CLIENT_NAME"),
    endpoint: getConfigOption("ENDPOINT"),

    speakerInterface: getConfigOption("SPEAKER_INTERFACE") ?? undefined,
    speakerChannels: getConfigOption("SPEAKER_CHANNELS") ?? undefined,
    speakerTranscodeRate:
      getConfigOption("SPEAKER_TRANSCODE_RATE") ?? undefined,
    speakerTranscodeBit: getConfigOption("SPEAKER_TRANSCODE_BIT") ?? undefined,

    microphoneInactivityFlush: getConfigOption("MICROPHONE_INACTIVITY_FLUSH"),
    microphoneAlsaInterface: getConfigOption("MICROPHONE_ALSA_INTERFACE"),
    microphoneAlsaChannels: getConfigOption("MICROPHONE_ALSA_CHANNELS"),
    microphoneAlsaVolume: getConfigOption("MICROPHONE_ALSA_VOLUME"),
    microphoneFilter: getConfigOption("MICROPHONE_FILTER"),
  });

  await client.start();
};

main();
