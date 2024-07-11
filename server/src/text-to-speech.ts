import { ConfigurationOptions, getConfigOption } from "./config/env.js";

export type CreateTextToSpeechResponseSuccess = {
  success: true;
  data: Buffer[];
};

export type CreateTextToSpeechResponseError = {
  success: false;
  message: string;
};

export type CreateTextToSpeechResponse =
  | CreateTextToSpeechResponseSuccess
  | CreateTextToSpeechResponseError;

export const createTextToSpeech = async (
  phrase: string
): Promise<CreateTextToSpeechResponse> => {
  const endpoint = getConfigOption(ConfigurationOptions.EndpointTts);

  const params = new URLSearchParams();
  params.set("text", phrase);
  params.set("voice", "en_US/vctk_low#p284"); //en_US/vctk_low#p284 | en_US/vctk_low#p239  | en_US/vctk_low#p260
  params.set("noiseScale", "0.333");
  params.set("noiseW", "0.333");
  params.set("lengthScale", "1.1");
  params.set("ssml", "false");
  params.set("audioTarget", "client");

  const response = await fetch(`${endpoint}?${params.toString()}`);

  if (response.status !== 200) {
  }

  const responseContent: Buffer[] = [];

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();

  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    responseContent.push(Buffer.from(chunk.value));
  }

  return {
    success: true,
    data: responseContent,
  };
};
