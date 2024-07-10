import { WebSocket } from "ws";
import { timeout } from "./util.js";
import { Speaker } from "./speaker.js";
import { MicrophoneDirect } from "./microphone-direct.js";
import { Microphone } from "./microphone.js";
import { MicrophoneFilter } from "./microphone-filter.js";

const CONFIG_ENDPOINT = process.env.ENDPOINT ?? "ws://localhost:3000/";

export type ClientOptions = {
  name: string;
  microphone: "filtered" | "direct";
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

    this.speaker = new Speaker();

    if (this.options.microphone === "direct") {
      this.microphone = new MicrophoneDirect();
    } else if (this.options.microphone === "filtered") {
      this.microphone = new MicrophoneFilter();
    } else {
      throw new Error("Expected options microphone to be set");
    }

    this.microphone.onData = this.onMicrophoneData;

    this.speaker.onAudioPlay = () => this.microphone.pause();
    this.speaker.onAudioStop = () => this.microphone.resume();
  }

  public start = async () => {
    this.microphone.start();
    this.speaker.start();
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

    this.socket = new WebSocket(CONFIG_ENDPOINT);

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

  private handleSocketDataAudio = async (buffer: Buffer) => {
    console.log("[handleSocketDataAudio] playing socket data audio");

    this.speaker.queue(buffer);
  };

  // =============================================
  // Event Handlers
  // =============================================

  private onMicrophoneData = async (data: Buffer) => {
    await this.sendSocketAudio(data);
  };

  private onSocketMessage = async (data: Buffer) => {
    const actionCharacter = data.subarray(0, 1).toString();
    const payload = Buffer.from(data.subarray(1));

    if (actionCharacter === "J") {
      await this.handleSocketDataJson(payload);
      return;
    }

    if (actionCharacter === "A") {
      await this.handleSocketDataAudio(payload);
      return;
    }

    console.log(
      "[onSocketMessage] Received unexpected payload",
      actionCharacter,
      payload.toString().substring(0, 32)
    );
  };
}
