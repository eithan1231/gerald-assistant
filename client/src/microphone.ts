import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";

const audioSampleRate = 16000;
const audioBitSize = 16;
const audioFormat = "s16le"; // "PCM signed 16-bit little-endian"

const audioByteSize = audioBitSize / 8;

// Editable. The size of the audio chunk.
const audioTargetChunkSize = (audioSampleRate * audioByteSize) / 20;

// Editable. The percentage of an audio chunk that needs to have voice
// detected for it to be marked as having speech.
const audioChunkDetectionPercentage = 0.2;

const audioDataPerSecond =
  audioSampleRate / (audioTargetChunkSize / audioByteSize);

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
  alsaInterface: string;

  /**
   * @example 2
   */
  alsaChannels: number;

  /**
   * FFMpeg defaults to 1
   * @example 1
   */
  alsaVolume?: number;

  /**
   * Whether or not we want to filter microphone background sounds.
   *
   * Uses a machine learning model, might impact performance
   */
  filter: boolean;
};

export class Microphone {
  private options: MicrophoneOptions;

  private processSox?: ChildProcessWithoutNullStreams;
  private processFfmpeg?: ChildProcessWithoutNullStreams;
  private processLogs: string[] = [];

  private paused = false;

  private audioBufferTotalLength = 0;
  private audioBufferLastDetectedIncrement = 0;
  private audioBuffer: Buffer[] = [];

  constructor(options: MicrophoneOptions) {
    this.options = options;
  }

  public onData: (audioBuffer: Buffer) => void = () => {
    throw new Error("Not implemented error");
  };

  public start() {
    console.log("[Microphone/start] Starting microphone.");

    if (this.processFfmpeg || this.processSox) {
      throw new Error("Already running process");
    }

    this.paused = false;

    this.processSox = this.spawnSox();
    this.processFfmpeg = this.spawnFfmpeg();

    this.processSox.stdout.pipe(this.processFfmpeg.stdin);

    const buffering: Buffer[] = [];

    this.processFfmpeg.stdout.on("data", (chunk: Buffer) => {
      buffering.push(chunk);

      let bufferedData = Buffer.concat(buffering);

      while (bufferedData.length >= audioTargetChunkSize) {
        const chunk = Buffer.from(
          bufferedData.buffer,
          bufferedData.byteOffset,
          audioTargetChunkSize
        );

        this.onAudioChunk(chunk);

        bufferedData = Buffer.from(
          bufferedData.buffer,
          bufferedData.byteOffset + audioTargetChunkSize,
          bufferedData.length - audioTargetChunkSize
        );
      }

      buffering.length = 0;

      if (bufferedData.length > 0) {
        buffering.push(bufferedData);
      }
    });

    this.processSox.stderr.on("data", (chunk: Buffer) =>
      this.onProcessLog(chunk)
    );

    this.processFfmpeg.stderr.on("data", (chunk: Buffer) =>
      this.onProcessLog(chunk)
    );
  }

  public stop() {
    this.processSox?.kill("SIGTERM");
    this.processFfmpeg?.kill("SIGTERM");
    this.audioBufferClear();

    this.processSox = undefined;
    this.processFfmpeg = undefined;
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
    this.audioBufferClear();
  }

  private spawnSox = () => {
    console.log("[Microphone/spawnSox] Starting");

    const args: string[] = [];

    args.push(`-t alsa ${this.options.alsaInterface}`);

    const channels = 1;

    args.push(
      `-t raw -b ${audioBitSize} -c ${channels} -r ${audioSampleRate} -e signed - vol ${
        this.options.alsaVolume ?? 1
      }`
    );

    console.log("[Microphone/spawnSox] args", args.join(" "));

    return spawn("sox", args, {
      shell: true,
      stdio: "pipe",
    });
  };

  private spawnFfmpeg = () => {
    console.log("[Microphone/spawnFfmpeg] Starting");

    const args = [];

    // Input format
    args.push(`-f`);
    args.push(audioFormat.toString());

    // Input sample-rate
    args.push(`-ar`);
    args.push(audioSampleRate.toString());

    // Input audio-channels
    args.push(`-ac`);
    args.push("1");

    // Input from STDIN
    args.push(`-i`);
    args.push("-");

    // Output audio filtering (background sounds)
    if (this.options.filter) {
      console.log("[Microphone/spawnFfmpeg] Filtering enabled");

      const modelFilename = path.join(
        process.cwd(),
        "./config/rnnoise-models/somnolent-hogwash/sh.rnnn"
      );

      args.push(`-af`);
      args.push(`\"arnndn=m='${modelFilename}'\"`);
    }

    // Output format
    args.push(`-f`);
    args.push(audioFormat);

    // Output sample-rate
    args.push(`-ar`);
    args.push(audioSampleRate.toString());

    // Output to STDOUT
    args.push("-");

    // General logging mode
    args.push("-v");
    args.push("error");

    console.log("[Microphone/spawnFfmpeg] args", args.join(" "));

    return spawn("ffmpeg", args, {
      stdio: "pipe",
      shell: true,
    });
  };

  private audioBufferFlush = () => {
    this.onData(Buffer.concat(this.audioBuffer));
    this.audioBufferClear();
  };

  private audioBufferClear = () => {
    this.audioBuffer = [];
    this.audioBufferTotalLength = 0;
  };

  private onAudioChunk = (chunk: Buffer) => {
    if (this.paused) {
      return;
    }

    this.audioBufferLastDetectedIncrement++;

    const flushAt = Math.round(
      audioDataPerSecond * this.options.inactivityFlush
    );

    let soundParts = 0;
    for (let i = 0; i < chunk.length; i += audioByteSize) {
      const sample = Math.abs(chunk.readInt16LE(i));

      if (sample > 2000) {
        soundParts++;
      }
    }

    if (
      soundParts >
      (chunk.length / audioByteSize) * audioChunkDetectionPercentage
    ) {
      this.audioBufferLastDetectedIncrement = 0;
    }

    if (this.audioBufferLastDetectedIncrement <= flushAt) {
      this.audioBufferTotalLength += chunk.length;
      this.audioBuffer.push(chunk);
    }

    if (this.audioBufferTotalLength > audioSampleRate * audioByteSize * 15) {
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

  private onProcessLog = (chunk: Buffer) => {
    if (this.processLogs.length > 256) {
      this.processLogs.splice(0, 1);
    }

    const chunkAsString = chunk.toString();

    if (chunkAsString.startsWith("\rIn:") || chunkAsString.startsWith("In:")) {
      // SOX progress report
      return;
    }

    this.processLogs.push(chunkAsString);

    console.log("[Microphone/onProcessLog] Output log");
    console.log(chunkAsString);
  };
}
