import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";

const audioSampleRate = 16000;
const audioBitSize = 16;
const audioFormat = "s16le"; // "PCM signed 16-bit little-endian"

export type MicrophoneOptions = {
  /**
   * @example 2.2
   * @example 1
   * @example 0.5
   */
  inactivityFlush: number;

  /**
   * @example hw:1,0
   */
  ffmpegAlsaInterface: string;

  /**
   * @example 2
   */
  ffmpegAlsaChannels: number;

  /**
   *
   */
  ffmpegFilterEnabled: boolean;
};

export class Microphone {
  private options: MicrophoneOptions;

  private ffmpeg?: ChildProcess;

  private paused = false;

  private audioBufferTotalLength = 0;
  private audioBufferLastDetectedIncrement = 0;
  private audioBuffer: Buffer[] = [];

  private sampleDataPerSecond = 0;

  private ffmpegLogs: string[] = [];

  constructor(options: MicrophoneOptions) {
    this.options = options;
  }

  public onData: (audioBuffer: Buffer) => void = () => {
    throw new Error("Not implemented error");
  };

  public start() {
    console.log("[Microphone/start] Starting microphone.");

    this.paused = false;

    const args: string[] = [];
    args.push(
      `-f alsa -channels ${this.options.ffmpegAlsaChannels} -i ${this.options.ffmpegAlsaInterface}`
    );

    // Audio-Channel
    args.push("-ac 1");

    if (this.options.ffmpegFilterEnabled) {
      console.log("[Microphone/start] Filtering enabled");

      const modelFilename = path.join(
        process.cwd(),
        "./config/rnnoise-models/somnolent-hogwash/sh.rnnn"
      );

      args.push(`-af \"arnndn=m='${modelFilename}'\"`);
    }

    // Sample rate
    args.push(`-ar ${audioSampleRate}`);

    // Log level
    args.push(`-v error`);

    // Stream to stdout
    args.push(`-f ${audioFormat} -`);

    this.ffmpeg = spawn("ffmpeg", args, { shell: true });

    this.ffmpeg.stdout?.on("data", (chunk: Buffer) => {
      // Resample audio chunk sizes every so often, it shouldn't change, but best to be safe.
      if (
        this.audioBufferLastDetectedIncrement === 1 ||
        this.sampleDataPerSecond === 0
      ) {
        const sampleDataPerSecond =
          audioSampleRate / (chunk.length * (8 / audioBitSize));

        if (this.sampleDataPerSecond !== sampleDataPerSecond) {
          console.log(
            `[Microphone/ffmpeg -> data] Sample data per second value updated from ${this.sampleDataPerSecond} to ${sampleDataPerSecond}`
          );

          this.sampleDataPerSecond = sampleDataPerSecond;
        }
      }

      this.onFfmpegAudio(chunk);
    });

    this.ffmpeg.stderr?.on("data", (chunk: Buffer) => this.onFfmpegLog(chunk));
  }

  public stop() {
    this.ffmpeg?.kill("SIGTERM");
    this.audioBufferClear();
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
    this.audioBufferClear();
  }

  private audioBufferFlush = () => {
    this.onData(Buffer.concat(this.audioBuffer));
    this.audioBufferClear();
  };

  private audioBufferClear = () => {
    this.audioBuffer = [];
    this.audioBufferTotalLength = 0;
  };

  private onFfmpegAudio = (chunk: Buffer) => {
    if (this.paused) {
      return;
    }

    this.audioBufferLastDetectedIncrement++;

    const flushAt = Math.round(
      this.sampleDataPerSecond * this.options.inactivityFlush
    );

    let soundParts = 0;
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = Math.abs(chunk.readInt16LE(i));

      if (sample > 2000) {
        soundParts++;
      }
    }

    // If more than an 8th of this sample has sound.
    if (soundParts > chunk.length / 2 / 8) {
      this.audioBufferLastDetectedIncrement = 0;
    }

    if (this.audioBufferLastDetectedIncrement <= flushAt) {
      this.audioBufferTotalLength += chunk.length;
      this.audioBuffer.push(chunk);
    }

    if (this.audioBufferTotalLength > 16000 * 15) {
      console.log(
        "[MicrophoneFilter/onFfmpegAudio ] Flushing ffmpeg audio due to buffer size"
      );

      return this.audioBufferFlush();
    }

    if (this.audioBufferLastDetectedIncrement === flushAt) {
      console.log(`[MicrophoneFilter/onFfmpegAudio] Flushing ffmpeg audio`);

      return this.audioBufferFlush();
    }
  };

  private onFfmpegLog = (chunk: Buffer) => {
    if (this.ffmpegLogs.length > 256) {
      this.ffmpegLogs.splice(0, 1);
    }

    this.ffmpegLogs.push(chunk.toString());

    console.log("[Microphone/onFfmpegLog] Error ocurred! See below");
    console.error(chunk.toString());
  };
}
