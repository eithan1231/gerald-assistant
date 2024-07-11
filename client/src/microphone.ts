export type Microphone = {
  onData?: (audioBuffer: Buffer) => void;

  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
};
