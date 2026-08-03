/** Small byte-twiddling helpers shared across the ROM layer. */

export function readLE16(data: Uint8Array, offset: number): number {
  if (!Number.isInteger(offset) || offset < 0 || offset + 2 > data.length) {
    throw new RangeError(
        `Cannot read 16-bit value at $${offset.toString(16)} ` +
        `from ${data.length} bytes.`);
  }
  return data[offset] | data[offset + 1] << 8;
}

export function writeLE16(data: Uint8Array, offset: number, value: number) {
  data[offset] = value & 0xff;
  data[offset + 1] = value >>> 8 & 0xff;
}

/** Copy `count` bytes starting at `offset` into a plain number array. */
export function tuple(data: Uint8Array, offset: number, count: number): number[] {
  if (!Number.isInteger(offset) || !Number.isInteger(count) ||
      offset < 0 || count < 0 || offset + count > data.length) {
    throw new RangeError(
        `Cannot read ${count} bytes at $${offset.toString(16)} ` +
        `from ${data.length} bytes.`);
  }
  const result = new Array<number>(count);
  for (let i = 0; i < count; i++) result[i] = data[offset + i];
  return result;
}

/** Build an array of `n` elements from a factory. */
export function seq<T>(n: number, f: (i: number) => T): T[] {
  const result = new Array<T>(n);
  for (let i = 0; i < n; i++) result[i] = f(i);
  return result;
}

/**
 * Read fixed-size records starting at `offset` until a record whose first byte
 * equals `terminator`, or until `max` records have been read.
 */
export function varSlice(data: Uint8Array, offset: number, size: number,
                         terminator: number, max = Infinity): number[][] {
  if (!Number.isInteger(offset) || !Number.isInteger(size) ||
      offset < 0 || size <= 0 || offset >= data.length) {
    throw new RangeError(`Invalid record range at $${offset.toString(16)}.`);
  }
  const result: number[][] = [];
  while (result.length < max) {
    if (offset >= data.length) {
      throw new RangeError(
          `Missing $${hex(terminator)} terminator before end of data.`);
    }
    if (data[offset] === terminator) return result;
    result.push(tuple(data, offset, size));
    offset += size;
  }
  return result;
}

/** Hex-format a number with at least `digits` digits. */
export function hex(n: number, digits = 2): string {
  return n.toString(16).padStart(digits, '0');
}

/** Reverse the bits of a byte (used for horizontal CHR flips). */
export function reverseBits(x: number): number {
  x = (x & 0x0f) << 4 | (x >>> 4 & 0x0f);
  x = (x & 0x33) << 2 | (x >>> 2 & 0x33);
  x = (x & 0x55) << 1 | (x >>> 1 & 0x55);
  return x & 0xff;
}

/** CRC-32, used for ROM identification and BPS checksums. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(data: Uint8Array, start = 0, end = data.length): number {
  let crc = -1;
  for (let i = start; i < end; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}
