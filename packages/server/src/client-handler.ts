import { WebSocket } from "ws";
import { timeout, unixTimestamp } from "./util.js";
import { Interpreter } from "./interpreter.js";
import { createTextToSpeech } from "./text-to-speech.js";
import {
  ConfigurationOptions,
  getConfigOption,
  getConfigOptionList,
} from "./config/env.js";
import { Adapter, AdapterActionResult } from "./adapter.js";

type ClientIdentification = {
  name: string;
};

export class ClientHandler {
  private clientSocket: WebSocket;
  private adapter: Adapter;

  private conversationKeepAliveTtl = 15;
  private conversationLastSeen = 0;

  private internalTranscribeSocket: WebSocket | null = null;
  private internalInterpreter?: Interpreter;

  private identification?: ClientIdentification;

  private interval: NodeJS.Timeout | null = null;

  private recentTranscriptionResults: Array<{ time: number; value: string }> =
    [];

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

  private getTranscribeSocket = async () => {
    if (
      this.internalTranscribeSocket &&
      this.internalTranscribeSocket.readyState === WebSocket.OPEN
    ) {
      return this.internalTranscribeSocket;
    }

    if (
      this.internalTranscribeSocket &&
      this.internalTranscribeSocket.readyState === WebSocket.CONNECTING
    ) {
      for (let i = 0; i < 10; i++) {
        //@ts-expect-error
        if (this.internalTranscribeSocket.readyState === WebSocket.OPEN) {
          return this.internalTranscribeSocket;
        }

        await timeout(20);
      }
    }

    this.internalTranscribeSocket = new WebSocket(
      getConfigOption(ConfigurationOptions.EndpointTranscribe)
    );

    this.internalTranscribeSocket.on("message", (data) => {
      if (data instanceof Buffer) {
        this.onTranscribeSocketData(data);
      }
    });

    this.internalTranscribeSocket.once("error", (err) =>
      this.onTranscribeSocketError(err)
    );

    for (let i = 0; i < 10; i++) {
      if (this.internalTranscribeSocket.readyState === WebSocket.OPEN) {
        return this.internalTranscribeSocket;
      }

      await timeout(20);
    }

    return null;
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
    const payload = Buffer.concat([Buffer.from("J"), data]);

    this.clientSocket.send(payload);
  };

  public sendAudio = async (data: Buffer) => {
    const payload = Buffer.concat([Buffer.from("A"), data]);

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

    await this.sendAudio(Buffer.concat(responseTts.data));
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

    this.adapter.subscribe(this.identification.name, (result) =>
      this.onAdapterEvent(result)
    );

    await this.sendJson({
      type: "identified",
    });

    return;
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

    const tsSocket = await this.getTranscribeSocket();

    if (tsSocket) {
      tsSocket.send(buffer);
    }
  };

  private handleTranscribedText = async (text: string) => {
    console.log(">", text);

    if (!this.identification) {
      console.log("[handleTranscribedText] Identification not found");
      return;
    }

    const interpreter = await this.getInterpreter();

    interpreter.addMessage(text);

    const responseInterpreter = await interpreter.process();

    if (responseInterpreter.type === "text") {
      console.log("<", responseInterpreter.text);

      await this.sendTts(responseInterpreter.text);
    }

    if (responseInterpreter.type === "action") {
      for (const action of responseInterpreter.actions) {
        const response = await this.adapter.runAction(
          this.identification.name,
          action.id,
          action.parameters
        );

        if (!response || !response.success) {
          console.log(
            `[handleTranscribedText] Adapter action failed, ${response?.success}`
          );

          continue;
        }

        for (const result of response.results) {
          if (result.type === "interpreter-message") {
            interpreter.addToolMessage(action.toolId, result.message);
          }

          if (result.type === "tts") {
            await this.sendTts(result.message);
          }

          if (result.type === "sound") {
            await this.sendAudio(result.data);
          }
        }
      }
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

  private onTranscribeSocketData = async (data: Buffer) => {
    const payload = JSON.parse(data.toString("utf8"));

    const text = payload.text.trim().toLowerCase();

    if (!text) {
      return;
    }

    if (
      this.recentTranscriptionResults.find(
        (item) => item.time + 5 > unixTimestamp() && item.value === text
      )
    ) {
      return;
    }

    this.recentTranscriptionResults.push({
      time: unixTimestamp(),
      value: text,
    });

    if (this.recentTranscriptionResults.length >= 4) {
      this.recentTranscriptionResults.splice(0, 1);
    }

    if (this.conversationLastSeen + 30 >= unixTimestamp()) {
      this.conversationLastSeen = unixTimestamp();

      await this.handleTranscribedText(text);

      return;
    }

    const words = getConfigOptionList(ConfigurationOptions.ListenWords);
    if (words.some((word) => text.indexOf(word) >= 0)) {
      this.conversationLastSeen = unixTimestamp();

      await this.handleTranscribedText(text);

      return;
    }
  };

  private onTranscribeSocketError = async (err: Error) => {
    console.error(err);
  };

  private onAdapterEvent = async (result: AdapterActionResult) => {
    for (const item of result.results) {
      if (item.type === "interpreter-message") {
        const interpreter = await this.getInterpreter();

        interpreter.addMessage(item.message);
      }

      if (item.type === "tts") {
        await this.sendTts(item.message);
      }

      if (item.type === "sound") {
        await this.sendAudio(item.data);
      }
    }
  };

  private onInterval = async () => {
    this.cleanupInterpreter();
  };
}
