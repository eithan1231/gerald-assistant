import {
  ChildProcess,
  ChildProcessWithoutNullStreams,
  spawn,
  exec,
} from "node:child_process";
import path from "node:path";

const audioSampleRate = 16000;
const audioBitSize = 16;
const audioFormat = "s16le"; // "PCM signed 16-bit little-endian"

const audioByteSize = audioBitSize / 8;

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
   * FFMpeg defaults to 1
   * @example 1
   */
  ffmpegFilterVolume?: number;

  /**
   *
   */
  ffmpegFilterEnabled: boolean;
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

  private sampleDataPerSecond = 0;

  constructor(options: MicrophoneOptions) {
    this.options = options;
  }

  public onData: (audioBuffer: Buffer) => void = () => {
    throw new Error("Not implemented error");
  };

  public start() {
    console.log("[Microphone/start] Starting microphone.");

    this.paused = false;

    if (this.options.ffmpegFilterEnabled) {
      this.startSoxThroughFfmpeg();
    } else {
      this.startSox();
    }
  }

  public stop() {
    this.processSox?.kill("SIGTERM");
    this.audioBufferClear();
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
    this.audioBufferClear();
  }

  private startSoxThroughFfmpeg() {
    console.log("[Microphone/startSoxThroughFfmpeg] Started.");

    const soxArgs: string[] = [];
    soxArgs.push(`-t alsa ${this.options.ffmpegAlsaInterface}`);
    soxArgs.push(
      `-t raw -b ${audioBitSize} -c 1 -r ${audioSampleRate} -e signed - vol ${
        this.options.ffmpegFilterVolume ?? 1
      }`
    );

    const ffmpegArgs = [];

    ffmpegArgs.push(
      `-f ${audioFormat} -ar ${audioSampleRate} -ac 1 -i - -f ${audioFormat} -`
    );

    ffmpegArgs.push("-v error");

    console.log("command -> sox", soxArgs.join(" "));
    console.log("command -> ffmpeg", ffmpegArgs.join(" "));

    this.processSox = spawn("sox", soxArgs.join(" ").split(" "), {
      stdio: "pipe",
    });

    this.processFfmpeg = spawn("ffmpeg", ffmpegArgs.join(" ").split(" "), {
      stdio: "pipe",
    });

    this.processSox.stdout.pipe(this.processFfmpeg.stdin);

    this.processFfmpeg.stdout.on("data", (chunk: Buffer) => {
      // Resample audio chunk sizes every so often, it shouldn't change, but best to be safe.
      // if (
      //   this.audioBufferLastDetectedIncrement === 1 ||
      //   this.sampleDataPerSecond === 0
      // ) {
      //   const sampleDataPerSecond =
      //     audioSampleRate / (chunk.length / audioByteSize);

      //   if (this.sampleDataPerSecond !== sampleDataPerSecond) {
      //     console.log(
      //       `[Microphone/ffmpeg -> data] Sample data per second value updated from ${this.sampleDataPerSecond} to ${sampleDataPerSecond}`
      //     );

      //     this.sampleDataPerSecond = sampleDataPerSecond;
      //   }
      // }

      const sampleDataPerSecond =
        audioSampleRate / (chunk.length / audioByteSize);

      if (this.sampleDataPerSecond !== sampleDataPerSecond) {
        console.log(
          `[Microphone/ffmpeg -> data] Sample data per second value updated from ${this.sampleDataPerSecond} to ${sampleDataPerSecond}`
        );

        this.sampleDataPerSecond = sampleDataPerSecond;
      }

      this.onAudioChunk(chunk);
    });

    this.processSox.stderr.on("data", (chunk: Buffer) =>
      this.onProcessLog(chunk)
    );

    this.processFfmpeg.stderr.on("data", (chunk: Buffer) =>
      this.onProcessLog(chunk)
    );
  }

  private startSox() {
    console.log("[Microphone/startSox] Started.");

    const args: string[] = [];

    args.push(
      `-t alsa ${this.options.ffmpegAlsaInterface} -t raw -b ${audioBitSize} -c 1 -r ${audioSampleRate}`
    );

    args.push("-");

    if (typeof this.options.ffmpegFilterVolume === "number") {
      args.push(`vol ${this.options.ffmpegFilterVolume}`);
    }

    this.startProcess("sox", args);
  }

  private startProcess(command: string, args: string[]) {
    if (this.processSox) {
      throw new Error("Sox is already open");
    }

    console.log(
      `[Microphone/startProcess] command "${command} ${args.join(" ")}"`
    );

    this.processSox = spawn(command, args);

    this.processSox.stdout?.on("data", (chunk: Buffer) => {
      // Resample audio chunk sizes every so often, it shouldn't change, but best to be safe.
      if (
        this.audioBufferLastDetectedIncrement === 1 ||
        this.sampleDataPerSecond === 0
      ) {
        const sampleDataPerSecond =
          audioSampleRate / (chunk.length / audioByteSize);

        if (this.sampleDataPerSecond !== sampleDataPerSecond) {
          console.log(
            `[Microphone/ffmpeg -> data] Sample data per second value updated from ${this.sampleDataPerSecond} to ${sampleDataPerSecond}`
          );

          this.sampleDataPerSecond = sampleDataPerSecond;
        }
      }

      this.onAudioChunk(chunk);
    });

    this.processSox.stderr?.on("data", (chunk: Buffer) =>
      this.onProcessLog(chunk)
    );
  }

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
      this.sampleDataPerSecond * this.options.inactivityFlush
    );

    let soundParts = 0;
    for (let i = 0; i < chunk.length; i += audioByteSize) {
      const sample = Math.abs(chunk.readInt16LE(i));

      if (sample > 2000) {
        soundParts++;
      }
    }

    // If more than an 8th of this sample has sound.
    if (soundParts > chunk.length / audioByteSize / 8) {
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

    this.processLogs.push(chunk.toString());

    console.log("[Microphone/onProcessLog] Error ocurred! See below");
    console.error(chunk.toString());
  };
}
