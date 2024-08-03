import { WebSocket } from "ws";
import { timeout, unixTimestamp } from "./util.js";
import { Interpreter } from "./interpreter.js";
import { createTextToSpeech } from "./text-to-speech.js";
import {
  ConfigurationOptions,
  getConfigOption,
  getConfigOptionList,
} from "./config/env.js";
import { Adapter, AdapterActionResultItem } from "./adapter.js";
import { transcodePcmToWav } from "./wav-transformer.js";

type ClientIdentification = {
  name: string;
};

export class ClientHandler {
  private clientSocket: WebSocket;
  private adapter: Adapter;

  private conversationKeepAliveTtl = 30;
  private conversationLastSeen = 0;

  private internalInterpreter?: Interpreter;

  private identification?: ClientIdentification;

  private interval: NodeJS.Timeout | null = null;

  constructor(clientSocket: WebSocket, adapter: Adapter) {
    this.clientSocket = clientSocket;
    this.adapter = adapter;

    this.clientSocket.once("error", (err) => this.onClientSocketError(err));
    this.clientSocket.on("message", (data) => {
      if (data instanceof Buffer) {
        this.onClientSocketMessage(data);
      }
    });

    this.clientSocket.once("open", () => this.onClientSocketOpen());
    this.clientSocket.once("close", () => this.onClientSocketClose());
  }

  private getTranscribedAudio = async (buffer: Buffer): Promise<string> => {
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
      `[ClientHandler/getTranscribedAudio] Response in ${perfResponse.toFixed(
        2
      )}ms, created payload in ${perfPayload.toFixed(2)}ms`
    );

    return responseData.text;
  };

  private cleanupInterpreter = async () => {
    if (!this.internalInterpreter) {
      return;
    }

    if (
      this.conversationLastSeen + this.conversationKeepAliveTtl >=
      unixTimestamp()
    ) {
      return;
    }

    if (this.internalInterpreter.getEndedTime() === 0) {
      return;
    }

    console.log(
      `[onIntervalInterpreterValidation] Conversation has exceeded threshold, ending`
    );

    let interpreter = this.internalInterpreter;

    this.internalInterpreter = undefined;

    await interpreter.end();
  };

  private getInterpreter = async () => {
    await this.cleanupInterpreter();

    if (!this.internalInterpreter) {
      this.internalInterpreter = new Interpreter();

      const actions = await this.adapter.getActions();
      for (const action of actions) {
        this.internalInterpreter.addAction(action);
      }

      await this.internalInterpreter.start();
    }

    return this.internalInterpreter;
  };

  // =============================================
  // Client Message Delivery
  // =============================================

  public sendJson = async (data: any) => {
    const payload = Buffer.concat([
      Buffer.from("J"),
      Buffer.from(JSON.stringify(data)),
    ]);

    this.clientSocket.send(payload);
  };

  public sendAudioWave = async (data: Buffer) => {
    const payload = Buffer.concat([Buffer.from("W"), data]);

    this.clientSocket.send(payload);
  };

  public sendTts = async (text: string) => {
    const responseTts = await createTextToSpeech(text);

    if (!responseTts.success) {
      console.log(
        `[sendTts] Failed to created speech from text with message, ${responseTts.message}`
      );

      return;
    }

    await this.sendAudioWave(responseTts.data);
  };

  // =============================================
  // Procedure Handlers
  // =============================================

  private handleJsonIdentify = async (payload: {
    type: "identify";
    [name: string]: any;
  }) => {
    if (!payload.name) {
      console.log(
        `[handleClientSocketDataJson] Received malformed payload, no name with identify payload`
      );
      return;
    }

    console.log(`[handleClientSocketDataJson] Identified ${payload.name}`);

    this.identification = {
      name: payload.name,
    };

    this.adapter.subscribe(
      this.identification.name,
      (result: AdapterActionResultItem) => this.onAdapterEvent(result)
    );

    await this.sendJson({
      type: "identified",
    });

    await timeout(50);

    await this.sendTts(`Identified by ${this.identification.name}`);
  };

  private handleClientSocketDataJson = async (buffer: Buffer) => {
    const payload = JSON.parse(buffer.toString());

    if (!payload.type) {
      console.log(
        `[handleClientSocketDataJson] Received malformed payload, no type`
      );

      return;
    }

    if (payload.type === "identify") {
      return await this.handleJsonIdentify(payload);
    }

    if (!this.identification) {
      console.log(`[handleClientSocketDataJson] Unidentified`);

      return;
    }
  };

  private handleClientSocketDataAudio = async (buffer: Buffer) => {
    if (!this.identification) {
      console.log(`[handleClientSocketDataAudio] Unidentified`);

      return;
    }

    const text = await this.getTranscribedAudio(buffer);

    if (
      this.conversationLastSeen + this.conversationKeepAliveTtl >=
      unixTimestamp()
    ) {
      this.conversationLastSeen = unixTimestamp();

      await this.handleTranscribedText(text);

      return;
    }

    const textLowered = text.toLowerCase();

    const words = getConfigOptionList(ConfigurationOptions.ListenWords);
    if (words.some((word) => textLowered.indexOf(word) >= 0)) {
      this.conversationLastSeen = unixTimestamp();

      await this.handleTranscribedText(text);

      return;
    }
  };

  private handleTranscribedText = async (text: string) => {
    console.log(">", text);

    if (!this.identification) {
      console.log("[handleTranscribedText] Identification not found");
      return;
    }

    const interpreter = await this.getInterpreter();

    await interpreter.addUserMessage(text);

    const responseInterpreter = await interpreter.process();

    if (responseInterpreter.type === "text") {
      console.log("<", responseInterpreter.text);

      await this.sendTts(responseInterpreter.text);
    }

    if (responseInterpreter.type === "action") {
      await this.adapter.runActions(
        this.identification.name,
        responseInterpreter.actions.map((action) => {
          return {
            id: action.id,
            parameters: action.parameters,
            toolId: action.toolId,
          };
        })
      );
    }
  };

  // =============================================
  // Event Handlers
  // =============================================

  private onClientSocketMessage = async (data: Buffer) => {
    const actionCharacter = data.subarray(0, 1).toString();
    const payload = Buffer.from(data.subarray(1));

    if (actionCharacter === "J") {
      await this.handleClientSocketDataJson(payload);
      return;
    }

    if (actionCharacter === "A") {
      await this.handleClientSocketDataAudio(payload);
      return;
    }

    console.log(
      "[onClientSocketMessage] Received unexpected payload",
      actionCharacter,
      payload.toString().substring(0, 32)
    );
  };

  private onClientSocketError = async (err: Error) => {
    console.error(err);
  };

  private onClientSocketOpen = () => {
    this.interval = setInterval(() => this.onInterval(), 5000);
  };

  private onClientSocketClose = () => {
    if (this.interval) {
      clearInterval(this.interval);
    }

    if (this.identification) {
      this.adapter.unsubscribe(this.identification.name);
    }
  };

  private onAdapterEvent = async (result: AdapterActionResultItem) => {
    if (!this.identification) {
      return;
    }

    const interpreter = await this.getInterpreter();

    if (result.type === "interpreter-assistant-message") {
      await interpreter.addAssistantMessage(result.message);
    }

    if (result.type === "interpreter-user-message") {
      await interpreter.addUserMessage(result.message);
    }

    if (result.type === "interpreter-tool-message") {
      await interpreter.addToolMessage(result.toolId, result.message);
    }

    if (result.type === "client-tts") {
      await this.sendTts(result.message);
    }

    if (result.type === "client-sound-wave") {
      await this.sendAudioWave(result.data);
    }

    if (result.type === "interpreter-evaluate") {
      const responseInterpreter = await interpreter.process();

      if (responseInterpreter.type === "text") {
        console.log("<", responseInterpreter.text);

        await this.sendTts(responseInterpreter.text);
      }

      if (responseInterpreter.type === "action") {
        for (const action of responseInterpreter.actions) {
          await this.adapter.runActions(this.identification.name, [
            {
              id: action.id,
              parameters: action.parameters,
              toolId: action.toolId,
            },
          ]);
        }
      }
    }
  };

  private onInterval = async () => {
    this.cleanupInterpreter();
  };
}
