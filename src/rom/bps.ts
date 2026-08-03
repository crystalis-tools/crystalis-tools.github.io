/**
 * BPS patch generation (https://www.romhacking.net/documents/746/).
 *
 * Layout: "BPS1", varint source size, varint target size, varint metadata
 * size, metadata, a stream of actions, then three little-endian CRC32s
 * (source, target, patch-so-far).
 *
 * Actions are `(length - 1) << 2 | mode` varints:
 *   0 SourceRead  - copy `length` bytes from source at the output position
 *   1 TargetRead  - `length` literal bytes follow
 *   2 SourceCopy  - signed varint offset delta, then copy from source
 *   3 TargetCopy  - signed varint offset delta, then copy from target
 *
 * This encoder emits only SourceRead and TargetRead, which is optimal for the
 * "same-size ROM, scattered byte edits" case an editor produces and keeps the
 * patch trivially verifiable.
 */

import {crc32} from './bytes';

class ByteSink {
  private bytes: number[] = [];

  push(...values: number[]) {
    for (const v of values) this.bytes.push(v & 0xff);
  }

  pushAll(values: Uint8Array | number[]) {
    for (const v of values) this.bytes.push(v & 0xff);
  }

  /** BPS variable-width number encoding (7 bits per byte, high bit = stop). */
  varint(value: number) {
    let v = value;
    while (true) {
      const x = v % 128;
      v = Math.floor(v / 128);
      if (v === 0) {
        this.bytes.push(0x80 | x);
        break;
      }
      this.bytes.push(x);
      v--;
    }
  }

  le32(value: number) {
    this.push(value, value >>> 8, value >>> 16, value >>> 24);
  }

  get length(): number {
    return this.bytes.length;
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function createBpsPatch(source: Uint8Array, target: Uint8Array,
                               metadata = ''): Uint8Array {
  const out = new ByteSink();
  out.pushAll([0x42, 0x50, 0x53, 0x31]); // "BPS1"
  out.varint(source.length);
  out.varint(target.length);

  const meta = new TextEncoder().encode(metadata);
  out.varint(meta.length);
  out.pushAll(meta);

  const common = Math.min(source.length, target.length);
  let pos = 0;
  while (pos < target.length) {
    // A byte matches if it is within the source and identical.
    const matches = pos < common && source[pos] === target[pos];
    let run = 1;
    while (pos + run < target.length) {
      const next = pos + run < common && source[pos + run] === target[pos + run];
      if (next !== matches) break;
      run++;
    }
    if (matches) {
      out.varint((run - 1) << 2 | 0); // SourceRead
    } else {
      out.varint((run - 1) << 2 | 1); // TargetRead
      out.pushAll(target.subarray(pos, pos + run));
    }
    pos += run;
  }

  out.le32(crc32(source));
  out.le32(crc32(target));
  const patchSoFar = out.toUint8Array();
  out.le32(crc32(patchSoFar));
  return out.toUint8Array();
}

class ByteSource {
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  bytesLeft(): number {
    return this.bytes.length - this.pos;
  }

  position(): number {
    return this.pos;
  }

  take(n: number): Uint8Array {
    const slice = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  varint(): number {
    let data = 0, shift = 1;
    while (true) {
      const x = this.bytes[this.pos++];
      data += (x & 0x7f) * shift;
      if (x & 0x80) break;
      shift *= 128;
      data += shift;
    }
    return data;
  }

  /** BPS-style signed varint: low bit is the sign, rest is the magnitude. */
  signedVarint(): number {
    const v = this.varint();
    return (v & 1) ? -(v >> 1) : (v >> 1);
  }

  le32(): number {
    const b = this.take(4);
    return (b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24) >>> 0;
  }
}

/** Return the standard BPS metadata string without applying the patch. The
 * caller should still apply the patch first when integrity validation is
 * required; `applyBpsPatch` verifies all three CRCs. */
export function readBpsMetadata(patch: Uint8Array): string {
  if (patch.length < 4 + 12 ||
      patch[0] !== 0x42 || patch[1] !== 0x50 || patch[2] !== 0x53 || patch[3] !== 0x31) {
    throw new Error('Not a BPS patch (missing "BPS1" header).');
  }
  const src = new ByteSource(patch);
  src.take(4);
  src.varint(); // source size
  src.varint(); // target size
  const metadataSize = src.varint();
  if (metadataSize > src.bytesLeft() - 12) {
    throw new Error('BPS patch is corrupt (invalid metadata size).');
  }
  return new TextDecoder().decode(src.take(metadataSize));
}

/**
 * Apply a BPS patch to `source`, returning the target ROM. Understands the
 * full BPS action set (source/target read/copy) for compatibility with
 * patches from other tools, even though {@link createBpsPatch} above only
 * ever emits SourceRead/TargetRead.
 */
export function applyBpsPatch(source: Uint8Array, patch: Uint8Array): Uint8Array {
  if (patch.length < 4 + 12 ||
      patch[0] !== 0x42 || patch[1] !== 0x50 || patch[2] !== 0x53 || patch[3] !== 0x31) {
    throw new Error('Not a BPS patch (missing "BPS1" header).');
  }
  const footer = patch.subarray(patch.length - 12);
  const patchCrc = footer[8] | footer[9] << 8 | footer[10] << 16 | footer[11] << 24;
  if ((patchCrc >>> 0) !== crc32(patch.subarray(0, patch.length - 4))) {
    throw new Error('BPS patch is corrupt (patch CRC mismatch).');
  }

  const src = new ByteSource(patch);
  src.take(4); // "BPS1"
  const sourceSize = src.varint();
  const targetSize = src.varint();
  const metaSize = src.varint();
  src.take(metaSize);

  if (sourceSize !== source.length) {
    throw new Error(
        `This patch expects a ${sourceSize}-byte source ROM, but the loaded ` +
        `ROM is ${source.length} bytes.`);
  }
  const sourceCrc = footer[0] | footer[1] << 8 | footer[2] << 16 | footer[3] << 24;
  if ((sourceCrc >>> 0) !== crc32(source)) {
    throw new Error('This patch was not built against the currently loaded ROM.');
  }

  const target = new Uint8Array(targetSize);
  let outPos = 0, sourceRelPos = 0, targetRelPos = 0;
  const actionsEnd = patch.length - 12;
  while (src.position() < actionsEnd) {
    const action = src.varint();
    const length = (action >> 2) + 1;
    switch (action & 3) {
      case 0: // SourceRead
        for (let i = 0; i < length; i++, outPos++) target[outPos] = source[outPos];
        break;
      case 1: // TargetRead
        target.set(src.take(length), outPos);
        outPos += length;
        break;
      case 2: // SourceCopy
        sourceRelPos += src.signedVarint();
        for (let i = 0; i < length; i++, outPos++, sourceRelPos++) {
          target[outPos] = source[sourceRelPos];
        }
        break;
      case 3: // TargetCopy
        targetRelPos += src.signedVarint();
        for (let i = 0; i < length; i++, outPos++, targetRelPos++) {
          target[outPos] = target[targetRelPos];
        }
        break;
    }
  }

  const targetCrc = footer[4] | footer[5] << 8 | footer[6] << 16 | footer[7] << 24;
  if ((targetCrc >>> 0) !== crc32(target)) {
    throw new Error('Patch applied but the result failed its checksum — the patch may be corrupt.');
  }
  return target;
}
