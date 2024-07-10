import { ChildProcess, spawn } from "node:child_process";

import { Microphone } from "./microphone.js";
import path from "node:path";

export class MicrophoneFilter implements Microphone {
  private ffmpeg?: ChildProcess;

  private paused = false;

  private audioBufferTotalLength = 0;
  private audioBufferLastDetectionIncrement = 0;
  private audioBuffer: Buffer[] = [];

  private ffmpegLogs: string[] = [];

  public onData: (audioBuffer: Buffer) => void = () => {
    throw new Error("Not implemented error");
  };

  public start() {
    this.paused = false;

    const modelFilename = path.join(
      process.cwd(),
      "./config/rnnoise-models/somnolent-hogwash/sh.rnnn"
    );

    const args = [
      // Microphone input using Alsa, on card 1, device 0
      "-f alsa -i hw:1,0",

      // Audio-Channel 1 (ensure mono audio)
      "-ac 1",

      // Background sound filtering
      `-af \"arnndn=m='${modelFilename}'\"`,

      // Set sample rate to 16000
      `-ar 16000`,

      // Stream to stdout, using encoding "s16le" -> "PCM signed 16-bit little-endian"
      "-f s16le -",
    ];

    this.ffmpeg = spawn("ffmpeg", args, { shell: true });

    this.ffmpeg.stdout?.on("data", (chunk: Buffer) =>
      this.onFfmpegAudio(chunk)
    );

    this.ffmpeg.stderr?.on("data", (chunk: Buffer) => this.onFfmpegLog(chunk));
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
    this.audioBuffer = [];
    this.audioBufferTotalLength = 0;
  }

  public stop() {
    this.ffmpeg?.kill("SIGTERM");
  }

  private onFfmpegAudio = (chunk: Buffer) => {
    if (this.paused) {
      return;
    }

    this.audioBufferLastDetectionIncrement++;

    let soundParts = 0;
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = Math.abs(chunk.readInt16LE(i));

      if (sample > 2000) {
        soundParts++;
      }
    }

    if (soundParts > chunk.length / 2 / 8) {
      this.audioBufferLastDetectionIncrement = 0;
    }

    const flushAt = 256;

    if (this.audioBufferLastDetectionIncrement <= flushAt) {
      this.audioBufferTotalLength += chunk.length;
      this.audioBuffer.push(chunk);
    }

    if (this.audioBufferLastDetectionIncrement === flushAt) {
      console.log(`[MicrophoneFilter/onFfmpegAudio] Flushing ffmpeg audio`);

      this.onData(Buffer.concat(this.audioBuffer));
      this.audioBuffer = [];
      this.audioBufferTotalLength = 0;
    }
  };

  private onFfmpegLog = (chunk: Buffer) => {
    if (this.ffmpegLogs.length > 256) {
      this.ffmpegLogs.splice(0, 1);
    }

    this.ffmpegLogs.push(chunk.toString());
  };
}
