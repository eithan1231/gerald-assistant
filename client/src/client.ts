import { WebSocket } from "ws";
import { timeout } from "./util.js";
import { Speaker } from "./speaker.js";
import { Microphone } from "./microphone.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfigOption } from "./config.js";

export type ClientOptions = {
  endpoint: string;
  name: string;

  microphoneInactivityFlush: number;
  microphoneAlsaInterface: string;
  microphoneAlsaChannels: number;
  microphoneAlsaVolume: number;
  microphoneFilter: boolean;

  speakerInterface: string;
  speakerChannels: number;
};

export class Client {
  private options: ClientOptions;

  private socket: WebSocket | null = null;
  private speaker: Speaker;
  private microphone: Microphone;

  private state: "pending" | "identifying" | "open" = "pending";

  public onAudioStart?: () => void;
  public onAudioEnd?: () => void;

  constructor(options: ClientOptions) {
    this.options = options;

    this.speaker = new Speaker({
      device: this.options.speakerInterface,
      channels: this.options.speakerChannels,
    });

    this.microphone = new Microphone({
      inactivityFlush: this.options.microphoneInactivityFlush,
      alsaChannels: this.options.microphoneAlsaChannels,
      alsaInterface: this.options.microphoneAlsaInterface,
      alsaVolume: this.options.microphoneAlsaVolume,
      filter: this.options.microphoneFilter,
    });

    this.microphone.onData = this.onMicrophoneData;

    this.speaker.onAudioPlay = () => this.microphone.pause();
    this.speaker.onAudioStop = () => this.microphone.resume();
  }

  public start = async () => {
    this.microphone.start();
    this.speaker.start();
    await this.getSocket();
  };

  public stop = async () => {
    this.microphone.stop();
    await this.speaker.stop();
    this.socket?.close();
  };

  private getSocket = async () => {
    const waitOpen = async () => {
      for (let i = 0; i < 10; i++) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          return true;
        }

        await timeout(10 * (i + 1));
      }

      return false;
    };

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      const sock = await waitOpen();
      if (sock) {
        return this.socket;
      }
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    this.socket = new WebSocket(this.options.endpoint);

    this.socket.once("open", () => {
      this.sendSocketJson({
        type: "identify",
        name: this.options.name,
      });
    });

    this.socket.on("message", (data) => {
      if (data instanceof Buffer) {
        this.onSocketMessage(data);
      }
    });

    this.socket.on("error", (err) => {
      console.error(err);
    });

    const sock = await waitOpen();
    if (sock) {
      return this.socket;
    }

    return null;
  };

  public sendSocketJson = async (data: any) => {
    const socket = await this.getSocket();
    if (!socket) {
      throw new Error("Unable to send data on null socket");
    }

    const payload = Buffer.concat([
      Buffer.from("J"),
      Buffer.from(JSON.stringify(data)),
    ]);

    await socket.send(payload);
  };

  public sendSocketAudio = async (audioBuffer: Buffer) => {
    const socket = await this.getSocket();

    if (!socket) {
      throw new Error("Failed to get socket");
    }

    if (this.state !== "open") {
      console.log(
        `[sendSocketAudio] Cannot send audio with state "${this.state}"`
      );

      return;
    }

    const payload = Buffer.concat([Buffer.from("A"), audioBuffer]);

    socket.send(payload);
  };

  // =============================================
  // Procedure Handlers
  // =============================================

  private handleSocketDataJson = async (buffer: Buffer) => {
    const payload = JSON.parse(buffer.toString());
    console.log(payload);

    if (!payload.type) {
      console.log(`[handleSocketDataJson] Received malformed payload, no type`);

      return;
    }

    if (payload.type === "identified") {
      this.state = "open";

      console.log("[handleSocketDataJson] Server marked as identified client");

      return;
    }
  };

  private handleSocketDataAudioWave = async (buffer: Buffer) => {
    console.log("[handleSocketDataAudio] playing socket data audio");

    this.speaker.queueWave(buffer);
  };

  // =============================================
  // Event Handlers
  // =============================================

  private onMicrophoneData = async (data: Buffer) => {
    await this.sendSocketAudio(data);

    if (getConfigOption("MICROPHONE_DEBUG")) {
      const date = new Date();
      const filename = `recording-${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}-${date.getMinutes()}-${date.getSeconds()} ${date
        .getMilliseconds()
        .toFixed(0)}.raw`;

      await writeFile(path.join("debug", "recordings", filename), data);
    }
  };

  private onSocketMessage = async (data: Buffer) => {
    const actionCharacter = data.subarray(0, 1).toString();
    const payload = Buffer.from(data.subarray(1));

    if (actionCharacter === "J") {
      await this.handleSocketDataJson(payload);
      return;
    }

    if (actionCharacter === "W") {
      await this.handleSocketDataAudioWave(payload);
      return;
    }

    console.log(
      "[onSocketMessage] Received unexpected payload",
      actionCharacter,
      payload.toString().substring(0, 32)
    );
  };
}
