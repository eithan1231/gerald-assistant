import nodeMic from "node-mic";
import { Microphone } from "./microphone.js";

export class MicrophoneDirect implements Microphone {
  private microphone: nodeMic;

  private allowMicrophoneData = false;
  private paused = false;

  private audioBufferTotalLength = 0;
  private audioBuffer: Buffer[] = [];

  public onData: (audioBuffer: Buffer) => void = () => {
    throw new Error("Not implemented error");
  };

  constructor() {
    this.microphone = new nodeMic({
      endian: "little",
      channels: 1,
      fileType: "raw",
      rate: 16000,
      encoding: "signed-integer",
      bitwidth: 16,
      threshold: 3,
    });
  }

  public start() {
    const stream = this.microphone.getAudioStream();

    stream.on("data", this.onMicrophoneData);
    stream.on("error", this.onMicrophoneError);
    stream.on("started", this.onMicrophoneStarted);
    stream.on("stopped", this.onMicrophoneStopped);
    stream.on("sound", this.onMicrophoneSound);
    stream.on("silence", this.onMicrophoneSilence);
    stream.on("exit", this.onMicrophoneExit);

    this.microphone.start();
  }

  public pause() {
    console.log("[Microphone/pause] Pausing microphone");
    this.paused = true;
    this.clearAudioBuffer();
  }

  public resume() {
    console.log("[Microphone/resume] Resuming microphone");

    this.paused = false;
  }

  public stop() {
    this.microphone.stop();
  }

  private onMicrophoneData = (data: Buffer) => {
    if (this.paused) {
      return;
    }

    if (!this.allowMicrophoneData) {
      return;
    }

    this.audioBufferTotalLength += data.length;
    this.audioBuffer.push(data);

    if (this.audioBufferTotalLength > 16000 * 15) {
      console.log(
        "[Microphone/onMicrophoneData] forcing flushAudioBuffer due to packet size"
      );

      this.flushAudioBuffer();
    }
  };

  private onMicrophoneError = (error: Error) => {
    console.log("[Microphone/onMicrophoneError]", error);
  };

  private onMicrophoneStarted = () => {
    console.log("[Microphone/onMicrophoneStarted] Started Event");
  };

  private onMicrophoneStopped = () => {
    console.log("[Microphone/onMicrophoneStopped] Stopped Event");
  };

  private onMicrophoneSound = () => {
    console.log("[Microphone/onMicrophoneSound] Sound Event");

    this.allowMicrophoneData = true;
  };

  private onMicrophoneSilence = async () => {
    console.log("[Microphone/onMicrophoneSilence] Silence Event");

    this.allowMicrophoneData = false;

    this.flushAudioBuffer();
  };

  private onMicrophoneExit = (code: unknown) => {
    console.log("[Microphone/onMicrophoneExit] Started");
  };

  private flushAudioBuffer = () => {
    console.log("[Microphone/flushAudioBuffer] Data delivery triggered");

    if (this.audioBuffer.length <= 0) {
      console.log(
        "[Microphone/flushAudioBuffer] Cancelling due to empty payload"
      );

      return;
    }

    if (this.onData) {
      this.onData(Buffer.concat(this.audioBuffer));
    }

    this.clearAudioBuffer();
  };

  private clearAudioBuffer = () => {
    console.log("[Microphone/clearAudioBuffer] Clearing local audio buffer");

    this.audioBuffer = [];
    this.audioBufferTotalLength = 0;
  };
}
