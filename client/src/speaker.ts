import { timeout } from "./util.js";
import { unlink, writeFile } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import { tmpdir } from "os";

export type SpeakerOptions = {
  device?: string;
  channels?: number;
  transcodeRate?: number;
  transcodeBit?: number;
};

type QueuedItem = {
  filename: string;
};

export class Speaker {
  private options: SpeakerOptions;

  private running = false;
  private disruptLoop = false;

  private queue: QueuedItem[] = [];

  public onAudioPlay?: () => void;
  public onAudioStop?: () => void;

  constructor(options: SpeakerOptions) {
    this.options = options;
  }

  private transcode = (filenameOriginal: string): Promise<string> => {
    if (!this.options.transcodeRate && !this.options.transcodeBit) {
      return Promise.resolve(filenameOriginal);
    }

    return new Promise((resolve) => {
      console.log(
        `[Speaker/transcode] Transcoding audio file ${filenameOriginal}`
      );

      const filenameTranscoded = path.join(
        tmpdir(),
        `playback-${Date.now()}-${Math.random().toFixed(2)}.wav`
      );

      const args = [];

      args.push(filenameOriginal);

      if (this.options.transcodeBit) {
        args.push("-b");
        args.push(this.options.transcodeBit.toString());
      }

      if (this.options.transcodeRate) {
        args.push("-r");
        args.push(this.options.transcodeRate.toString());
      }

      if (this.options.channels) {
        args.push("-c");
        args.push(this.options.channels.toString());
      }

      args.push(filenameTranscoded);

      const process = spawn("sox", args, {
        shell: true,
        stdio: "pipe",
      });

      process.stderr.on("data", (chunk: Buffer) => {
        console.log(
          `[Speaker/transcode] sox transcode error,`,
          chunk.toString()
        );
      });

      process.once("exit", () => {
        resolve(filenameTranscoded);
      });
    });
  };

  private playback = (filename: string) => {
    return new Promise((resolve, reject) => {
      console.log(`[Speaker/playback] Playing audio file ${filename}`);

      const args: string[] = [];

      // Device name
      if (this.options.device) {
        args.push(`--device=${this.options.device}`);
      }

      // Channels
      if (this.options.channels) {
        args.push(`--channels=${this.options.channels}`);
      }

      // Suppresses messages
      args.push(`--quiet`);

      args.push(filename);

      const handle = spawn("aplay", args, {
        stdio: "pipe",
        shell: true,
      });

      handle.stderr.on("data", (chunk: Buffer | string) => {
        console.log(`[Speaker/playback] aplay error`, chunk.toString());
      });

      handle.once("exit", (code) => {
        resolve(true);
      });
    });
  };

  private speakerLoop = async () => {
    this.running = true;

    while (!this.disruptLoop) {
      if (this.queue.length > 0) {
        if (this.onAudioPlay) {
          this.onAudioPlay();
        }

        const audios = this.queue.splice(0, this.queue.length);

        for (const audio of audios) {
          const transcodedFilename = await this.transcode(audio.filename);

          await this.playback(transcodedFilename);

          await unlink(audio.filename);

          if (audio.filename !== transcodedFilename) {
            await unlink(transcodedFilename);
          }

          await timeout(200);
        }

        await timeout(700);

        if (this.onAudioStop) {
          this.onAudioStop();
        }
      }

      await timeout(50);
    }

    this.running = false;
  };

  public start = () => {
    console.log(
      `[Speaker/start] starting, channels ${this.options.channels}, device ${this.options.device}`
    );

    this.disruptLoop = false;

    this.speakerLoop();
  };

  public stop = async () => {
    this.disruptLoop = true;

    for (let i = 0; i < 5000; i++) {
      if (!this.running) {
        return;
      }

      await timeout(10);
    }
  };

  public queueWave = async (data: Buffer) => {
    const filename = path.join(
      tmpdir(),
      `playback-${Date.now()}-${Math.random().toFixed(2)}.wav`
    );

    await writeFile(filename, data);

    this.queue.push({
      filename,
    });
  };
}
