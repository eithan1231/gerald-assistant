import { ConfigurationOptions, getConfigOption } from "~/config/env.js";
import { transcodePcmToWav } from "./wav-transformer.js";

/**
 * @param buffer 16bit, 16000 sample rate, single channel audio
 */
export const speechToText = async (buffer: Buffer): Promise<string> => {
  const start = performance.now();

  const result = transcodePcmToWav(
    {
      channels: 1,
      depth: 16,
      rate: 16000,
    },
    buffer
  );

  const blob = new Blob([result], { type: "audio/wav" });

  const form = new FormData();
  form.append("file", blob, "audio.wav");
  form.append("model", getConfigOption(ConfigurationOptions.WhisperModel));

  const perfPayload = performance.now() - start;

  const response = await fetch(
    getConfigOption(ConfigurationOptions.EndpointTranscribe),
    {
      method: "POST",
      body: form,
    }
  );

  const responseData = await response.json();

  const perfResponse = performance.now() - start;

  console.log(
    `[speechToText] Response in ${perfResponse.toFixed(
      2
    )}ms, created payload in ${perfPayload.toFixed(2)}ms`
  );

  return responseData.text;
};
