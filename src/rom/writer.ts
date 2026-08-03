/**
 * Free-space bookkeeping for writing edited map data back into the ROM.
 *
 * The strategy is deliberately conservative: a location's data is rewritten in
 * place whenever the new blob fits inside the region it already owns
 * exclusively.  Otherwise it is relocated into a free chunk of the same bank
 * group and its pointer-table entry is repointed.  Free chunks come from two
 * sources: runs of $ff padding that no location references, and regions
 * vacated when a location relocates away.
 */

export interface Chunk {
  start: number;
  end: number;
}

/** Minimum length of an $ff run before it is trusted as padding. */
const MIN_PADDING_RUN = 16;

export class Arena {
  private chunks: Chunk[] = [];

  constructor(readonly name: string,
              readonly start: number,
              readonly end: number) {}

  /** Total free bytes currently tracked. */
  get available(): number {
    return this.chunks.reduce((n, c) => n + (c.end - c.start), 0);
  }

  /** Largest single allocatable run. */
  get largest(): number {
    return this.chunks.reduce((n, c) => Math.max(n, c.end - c.start), 0);
  }

  contains(offset: number): boolean {
    return offset >= this.start && offset < this.end;
  }

  free(start: number, end: number) {
    if (end <= start) return;
    this.chunks.push({start, end});
    this.coalesce();
  }

  /** First-fit allocation; returns the PRG offset or null if it does not fit. */
  alloc(size: number): number | null {
    if (size <= 0) return null;
    for (const chunk of this.chunks) {
      if (chunk.end - chunk.start >= size) {
        const offset = chunk.start;
        chunk.start += size;
        this.chunks = this.chunks.filter(c => c.end > c.start);
        return offset;
      }
    }
    return null;
  }

  private coalesce() {
    this.chunks.sort((a, b) => a.start - b.start);
    const merged: Chunk[] = [];
    for (const chunk of this.chunks) {
      const last = merged[merged.length - 1];
      if (last && chunk.start <= last.end) {
        last.end = Math.max(last.end, chunk.end);
      } else {
        merged.push({...chunk});
      }
    }
    this.chunks = merged;
  }

  /**
   * Seed the free list with runs of `$ff` that fall outside every range in
   * `used`.  `used` must be sorted and non-overlapping.
   */
  seedFromPadding(prg: Uint8Array, used: readonly Chunk[]) {
    const blocked = mergeRanges(used.filter(
        r => r.end > this.start && r.start < this.end));
    let cursor = this.start;
    for (const range of [...blocked, {start: this.end, end: this.end}]) {
      const gapEnd = Math.min(range.start, this.end);
      if (gapEnd > cursor) this.scanPadding(prg, cursor, gapEnd);
      cursor = Math.max(cursor, Math.min(range.end, this.end));
    }
  }

  private scanPadding(prg: Uint8Array, from: number, to: number) {
    let runStart = -1;
    for (let i = from; i <= to; i++) {
      const isPad = i < to && prg[i] === 0xff;
      if (isPad) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        if (i - runStart >= MIN_PADDING_RUN) this.free(runStart, i);
        runStart = -1;
      }
    }
  }
}

/**
 * Lays byte blobs into a fixed set of free chunks, sharing storage between
 * blobs with identical contents.
 *
 * Compaction uses this over the exact byte ranges the vanilla ROM already
 * devotes to location data, so nothing outside that set is ever touched - the
 * banks also hold unrelated tables that must survive untouched.
 */
export class Packer {
  private readonly chunks: Chunk[];
  private readonly cursors: number[];
  private readonly placed = new Map<string, number>();
  private used = 0;

  constructor(chunks: readonly Chunk[]) {
    this.chunks = mergeRanges(chunks);
    this.cursors = this.chunks.map(c => c.start);
  }

  /** Total bytes across all chunks. */
  get capacity(): number {
    return this.chunks.reduce((n, c) => n + (c.end - c.start), 0);
  }

  /** Bytes handed out so far, counting each shared blob once. */
  get allocated(): number {
    return this.used;
  }

  get remaining(): number {
    return this.capacity - this.used;
  }

  /** Offset already assigned to this content, if it has been placed. */
  offsetOf(bytes: readonly number[]): number | null {
    return this.placed.get(bytes.join(',')) ?? null;
  }

  /**
   * Reserve space for `bytes`, returning its offset.  Identical content is
   * stored once and its offset reused.  Returns null when nothing fits - a
   * blob may not straddle two chunks, since foreign data sits between them.
   *
   * Placement is best-fit: the chunk left with the least slack wins.  The
   * owned ranges are broken up by unrelated data, so first-fit strands small
   * tails that later blobs then cannot use.
   */
  place(bytes: readonly number[]): number | null {
    const key = bytes.join(',');
    const existing = this.placed.get(key);
    if (existing != null) return existing;

    let best = -1;
    let bestSlack = Infinity;
    for (let i = 0; i < this.chunks.length; i++) {
      const slack = this.chunks[i].end - this.cursors[i] - bytes.length;
      if (slack >= 0 && slack < bestSlack) {
        best = i;
        bestSlack = slack;
      }
    }
    if (best < 0) return null;

    const offset = this.cursors[best];
    this.cursors[best] += bytes.length;
    this.used += bytes.length;
    this.placed.set(key, offset);
    return offset;
  }

  /**
   * Place a batch largest-first, which pairs with best-fit to keep
   * fragmentation down.  Returns the first item that did not fit, or null on
   * success.
   */
  placeAll(items: ReadonlyArray<readonly number[]>): readonly number[] | null {
    const order = [...items].sort((a, b) => b.length - a.length);
    for (const item of order) {
      if (this.place(item) == null) return item;
    }
    return null;
  }

  /** Every chunk's unallocated tail, for clearing to a fill byte. */
  tails(): Chunk[] {
    return this.chunks
        .map((c, i) => ({start: this.cursors[i], end: c.end}))
        .filter(c => c.end > c.start);
  }
}

/** Whether `suffix` appears as the trailing bytes of `bytes` - used to find
 *  records that can share a longer one's tail instead of owning separate
 *  space, for tables packed with no free bytes to spare. */
export function isSuffix(suffix: readonly number[], bytes: readonly number[]): boolean {
  if (suffix.length > bytes.length) return false;
  const start = bytes.length - suffix.length;
  for (let i = 0; i < suffix.length; i++) {
    if (bytes[start + i] !== suffix[i]) return false;
  }
  return true;
}

/** Merge a list of ranges into sorted, non-overlapping ranges. */
export function mergeRanges(ranges: readonly Chunk[]): Chunk[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Chunk[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({...range});
    }
  }
  return merged;
}
