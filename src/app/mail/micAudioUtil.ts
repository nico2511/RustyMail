export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function mediaBlobToWav16kMonoPcm16(blob: Blob): Promise<Uint8Array> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await ctx.close().catch(() => undefined);
  }
  const inRate = audioBuf.sampleRate;
  const inCh = audioBuf.numberOfChannels;
  const inLen = audioBuf.length;
  const mono = new Float32Array(inLen);
  for (let i = 0; i < inLen; i++) {
    let s = 0;
    for (let c = 0; c < inCh; c++) s += audioBuf.getChannelData(c)[i];
    mono[i] = s / inCh;
  }
  const outRate = 16_000;
  const outLen = Math.max(1, Math.floor((inLen * outRate) / inRate));
  const resampled = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * inRate) / outRate;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, inLen - 1);
    const f = pos - i0;
    resampled[i] = mono[i0] * (1 - f) + mono[i1] * f;
  }
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = Math.max(-1, Math.min(1, resampled[i]));
    pcm[i] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
  }
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(off + j, s.charCodeAt(j));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  return new Uint8Array(buf);
}
