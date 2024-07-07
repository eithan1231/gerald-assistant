import SpeakerLib from "speaker";
import { timeout } from "./util.js";

export class Speaker {
  private speaker: SpeakerLib;

  private running = false;
  private disruptLoop = false;

  private queuedAudio: Buffer[] = [];

  public onAudioPlay?: () => void;
  public onAudioStop?: () => void;

  constructor() {
    this.speaker = new SpeakerLib({
      channels: 1,
      sampleRate: 22050,
      bitDepth: 16,
    });
  }

  private speakerWrite = (buffer: Buffer) =>
    new Promise((resolve, reject) =>
      this.speaker.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(null);
        }
      })
    );

  private speakerLoop = async () => {
    this.running = true;

    while (!this.disruptLoop) {
      if (this.queuedAudio.length > 0) {
        if (this.onAudioPlay) {
          this.onAudioPlay();
        }

        const audios = this.queuedAudio.splice(0, 1);

        for (const audio of audios) {
          await this.speakerWrite(audio);
        }

        await timeout(700);

        if (this.onAudioStop) {
          this.onAudioStop();
        }
      }
      await timeout(100);
    }

    this.running = false;
  };

  public start = () => {
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

  public queue = (data: Buffer) => {
    this.queuedAudio.push(data);
  };
}