/**
 * Based on this implementation, except slightly improved.
 * https://github.com/pdeschen/pcm.js/tree/master
 */

export type TranscodePcmToWavOptions = {
  channels?: number;
  rate?: number;
  depth?: number;
};

export const transcodePcmToWav = (
  options: TranscodePcmToWavOptions,
  data: Buffer
): Buffer => {
  const config = {
    channels: options.channels ?? 2,

    rate: options.rate ?? 16000,

    depth: options.depth ?? 16,
  };

  const header = {
    // OFFS SIZE NOTES
    chunkId: [0x52, 0x49, 0x46, 0x46], // 0    4    "RIFF" = 0x52494646
    chunkSize: 0, // 4    4    36+SubChunk2Size = 4+(8+SubChunk1Size)+(8+SubChunk2Size)
    format: [0x57, 0x41, 0x56, 0x45], // 8    4    "WAVE" = 0x57415645
    subChunk1Id: [0x66, 0x6d, 0x74, 0x20], // 12   4    "fmt " = 0x666d7420
    subChunk1Size: 16, // 16   4    16 for PCM
    audioFormat: 1, // 20   2    PCM = 1
    numChannels: config.channels, // 22   2    Mono = 1, Stereo = 2...
    sampleRate: config.rate, // 24   4    8000, 44100...
    byteRate: 0, // 28   4    SampleRate*NumChannels*BitsPerSample/8
    blockAlign: 0, // 32   2    NumChannels*BitsPerSample/8
    bitsPerSample: config.depth, // 34   2    8 bits = 8, 16 bits = 16len
    subChunk2Id: [0x64, 0x61, 0x74, 0x61], // 36   4    "data" = 0x64617461
    subChunk2Size: 0, // 40   4    data size = NumSamples*NumChannels*BitsPerSample/8
  };

  header.blockAlign = (header.numChannels * header.bitsPerSample) >> 3;
  header.byteRate = header.blockAlign * header.sampleRate;
  header.subChunk2Size = data.length * (header.bitsPerSample >> 3);
  header.chunkSize = 36 + header.subChunk2Size;

  const result = Buffer.alloc(data.length + 44);

  let offset = 0;

  result.writeUInt8(header.chunkId[0], offset++);
  result.writeUInt8(header.chunkId[1], offset++);
  result.writeUInt8(header.chunkId[2], offset++);
  result.writeUInt8(header.chunkId[3], offset++);

  result.writeUInt32LE(header.chunkSize, offset);
  offset += 4;

  result.writeUInt8(header.format[0], offset++);
  result.writeUInt8(header.format[1], offset++);
  result.writeUInt8(header.format[2], offset++);
  result.writeUInt8(header.format[3], offset++);

  result.writeUInt8(header.subChunk1Id[0], offset++);
  result.writeUInt8(header.subChunk1Id[1], offset++);
  result.writeUInt8(header.subChunk1Id[2], offset++);
  result.writeUInt8(header.subChunk1Id[3], offset++);

  result.writeUInt32LE(header.subChunk1Size, offset);
  offset += 4;

  result.writeUInt16LE(header.audioFormat, offset);
  offset += 2;

  result.writeUInt16LE(header.numChannels, offset);
  offset += 2;

  result.writeUInt32LE(header.sampleRate, offset);
  offset += 4;

  result.writeUInt32LE(header.byteRate, offset);
  offset += 4;

  result.writeUInt16LE(header.blockAlign, offset);
  offset += 2;

  result.writeUInt16LE(header.bitsPerSample, offset);
  offset += 2;

  result.writeUInt8(header.subChunk2Id[0], offset++);
  result.writeUInt8(header.subChunk2Id[1], offset++);
  result.writeUInt8(header.subChunk2Id[2], offset++);
  result.writeUInt8(header.subChunk2Id[3], offset++);

  result.writeUInt32LE(header.subChunk2Size, offset);
  offset += 4;

  data.copy(result, offset);

  return result;
};
