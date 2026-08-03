# Crystalis Tools

A browser-based ROM editor for Crystalis (NES). Load a ROM, edit it, and export either a full ROM or a BPS patch. TypeScript + Vite, no runtime dependencies — the ROM never leaves the browser.

```bash
npm install
npm run dev
npm test               # byte-level self test, no ROM needed
npm run checkrom       # parse/build/round-trip against research/Crystalis (USA).nes
npm run checksprites   # sprite table coverage against a real ROM
npm run rendermap      # render locations to PNG headlessly (node_modules/.tmp/render)
npm run build          # typecheck + production bundle into dist/
```

Open a ROM with **File ▸ Open ROM…**, or drop a `.nes` file on the window.

## What it does today

- **Explorer** — all 215 named locations, grouped by area, filterable.
- **Map canvas** — composed screens rendered from the real tileset, CHR
  patterns and palettes, at 25%–400% zoom. Overlays for the screen grid, tile
  grid, spawn labels, entrances, exits, flag screens and tile effects.
- **Sprites** — spawns render as their actual metasprites: the real CHR tiles,
  sprite palettes, per-tile flips and mirrored entries, resolved through
  ObjectData for monsters and the NPC appearance table for people. Direction-
  facing walkers and blobs follow the same runtime metasprite selection the
  game uses, and **Display ▸ Animate sprites** steps the frame counter.
  Anything with no sprite (walls, triggers, generic spawns) falls back to a
  labelled marker.
- **Paint tool** — click/drag to paint the selected metatile. Right-click or
  alt-click picks the metatile under the cursor.
- **Select tool** — click a screen cell to edit its screen id; click and drag
  spawns, exits and entrances to move them.
- **Inspector** — three tabs:
  - *Map*: size, music, tileset, tile effects, CHR pattern banks, the three
    background palettes (with live swatches), animation, screen plane,
    checkpoint/saveable flags, plus lists and editors for exits, entrances,
    flag screens and pits.
  - *Tiles*: the 256-metatile palette for the current tileset, and an editor
    for the selected metatile's four CHR quadrants, palette attribute and
    terrain effects.
  - *NPCs*: the spawn table with resolved monster and NPC names, a live
    preview of the metasprite each spawn draws, type/id/position/flag editing,
    plus the location's sprite palettes and pattern banks.
- **Source view** — an annotated hex dump of exactly the bytes a location will
  serialize to, including the pointer header and each block's destination.
- **Undo/redo** — transactional, covering location data, shared screen tiles,
  shared tilesets and shops (Ctrl+Z / Ctrl+Shift+Z).
- **Export** — full ROM (`Ctrl+E`) or BPS patch against the ROM as loaded
  (`Ctrl+B`). **File ▸ Show build log** reports where every rewritten location
  landed and how much free space is left.
- **Shops** — a `Shops` folder in the explorer, next to `Maps`, lists all 34
  shops (11 towns x armor/tool/inn, plus one global Pawn Shop entry). Clicking
  one opens it as its own tab, same as a map: item contents via a picker,
  prices, and the pawn shop's universal per-item base prices. A shop's town
  isn't stored directly in the ROM; it's resolved by matching the shopkeeper
  NPC placed in each candidate location, same as crystalis-randomizer's
  vanilla `Shop` class. Five of the 11 towns have no armor shop in vanilla
  (Oak, Nadare, Joel, Goa, Sahara) - those entries are dimmed and still
  openable, showing a warning that nothing in-game reads the bytes. Item
  names come from the ROM's message-text name table, not a hardcoded list.

Keyboard: `Ctrl+P` command palette, `B` paint, `V` select, `Ctrl+I` toggle the
inspector, `Ctrl+0/=/-` zoom.

## How saving works

Crystalis stores each location's `MapData` as a pointer header followed by a
layout block, a graphics block, and entrance/exit/flag/pit blocks; `NpcData` is
a separate blob holding sprite banks and the spawn table. Both are reached
through pointer tables, so edited data does not have to stay put.

The writer tries the cheapest thing first and escalates:

1. **In place.** Serialize the location into one self-contained blob (header +
   every block). If it fits the region the location already owns *exclusively*,
   write it there and return the leftover tail to the allocator. "Exclusively"
   matters because vanilla shares blocks between locations — if one of a
   location's blocks is referenced elsewhere, or another location's data sits
   inside its extent, it is not overwritten in place.
2. **Relocate.** Otherwise allocate from runs of at least 16 `$ff` bytes that no
   location references, plus anything vacated by earlier relocations, and
   repoint the pointer-table entry.
3. **Compact.** Vanilla packs these banks tight — there are only 518 bytes of
   `$ff` padding in the whole map-data region, longest run 21 — so step 2
   usually fails. The fallback repacks *every* location over the exact byte
   ranges location data already occupies, sharing identical blocks the way
   vanilla does. That reclaims the padding stranded inside each location's
   extent and recovers block sharing after an edit breaks it.

Compaction only writes to bytes that already belong to location data. Both bank
groups also hold unrelated tables (a 774-byte table at `$17cfa`, several
smaller ones, and the pointer tables themselves), and a blob is never allowed to
straddle the gap where one of those sits. Placement is best-fit, largest blob
first, because those gaps fragment the free space.

On a vanilla ROM this leaves roughly **2 KB free in the map-data banks and about
30 bytes in the NPC-data banks**. Map edits — resizing, repainting, adding exits
— have plenty of room. Adding spawns does not: the NPC banks are essentially
full in vanilla, so only a handful of new spawns fit across the entire ROM.
When something does not fit, the build is abandoned with a warning naming the
exact shortfall and **nothing is written** — the exported ROM is never
half-updated.

Screens, tilesets, tile effects, palettes and CHR are written back to their
fixed tables in place — none of those can move.

**Screens are shared.** A screen id used by several locations is one set of
bytes in the ROM; painting a tile changes every map that uses it. The inspector
shows the reference count for the selected screen so this is visible before you
paint.

## ROM offsets

All offsets are into the PRG image (the file with its 16-byte iNES header
stripped). Sourced from the crystalis-randomizer disassembly.

| Data | PRG offset | Notes |
| --- | --- | --- |
| MapData pointer table | `$14300` | `id * 2`, value + `$c000` = PRG offset |
| NpcData pointer table | `$19201` | `id * 2`, value + `$10000` = PRG offset |
| MapData arena | `$14000`–`$18000` | segments `$0a`/`$0b` |
| NpcData arena | `$18000`–`$1c000` | segments `$0c`/`$0d` |
| Screen tiles | `id << 8` | 16×15 metatiles; `$100`+ relocated to `(id+$40) << 8` |
| Tileset quadrants | `$10000 \| map << 8` | four 256-byte tables |
| Tileset attributes | `$13000 \| map << 4` | 2 bits per metatile, packed |
| Tileset alternates | `$13e00 \| map << 3` | 32 entries, metatiles `$00`–`$1f` |
| Tile effects | `$12000 \| (id << 8) & $1fff` | 256 bytes per set |
| Background palettes | `$40f0` | swizzled: `(id&3)<<2 \| (id&$fc)<<6` |
| Checkpoint/saveable | `$2ff00 \| id` | bit 7 checkpoint, bit 0 saveable |
| Metasprite pointers | `$3845c` | `id * 2`, value + `$30000`; below `$38000` = unused |
| ObjectData pointers | `$1ac00` | `id * 2`, value + `$10000` |
| NPC appearance | `$80f0 \| (id&$fc)<<6 \| (id&3)<<2` | four bytes each |
| Armor shop items/prices | `$21da4` / `$21dd0` | 11 towns x 4 slots (item id / 16-bit price) |
| Tool shop items/prices | `$21e28` / `$21e54` | same layout as armor |
| Inn prices | `$21eac` | 11 x 16-bit price |
| Pawn shop base prices | `$21ec2` | 1 x 16-bit price per item id, `$00`-`$48` |
| Shop location search table | `$21f54` / `$21f75` | 33 rows: location id / town index (0-10) |
| Item name pointers | `$28a5c` | `id * 2`, value `+ $20000`, NUL-terminated ASCII |

Rendering follows the hardware. Backgrounds: a metatile is four CHR tiles, tile
bit 7 selects between the location's two pattern banks (`patterns[n] << 6 |
tile & $7f`), and the tileset's 2-bit attribute picks one of the location's
three background palettes (attribute 3 falls back to palette `$7f`).

Sprites: a metasprite is a list of `[dx, dy, attributes, tile]` rows per
animation frame, terminated by `$80` in `dx`. Tiles come from
`spritePatterns[spawn.patternBank] << 6 | tile & $3f`; attribute bits 0–1 index
`[$b0, $b1, spritePalettes[0] + $b0, spritePalettes[1] + $b0]`, and bits 6–7 are
horizontal and vertical flips. Entries beginning `$ff` mirror another
metasprite, drawn with `dx = -8 - dx` and the horizontal flip toggled. Spawns
sit at `(xt * 16 + 8, tileY(yt) + 12)`.

ObjectData packs 32 property slots sparsely — a bitmask byte before each group
of eight, with only the set slots present in the stream. Slot 0 is the
metasprite, slot 13 (low 7 bits) the AI action, slot 31 the base metasprite for
direction-facing walkers.

## Testing

`npm test` needs no ROM: it synthesizes a PRG image with hand-laid MapData and
NpcData structures and checks that parse, serialize, build and re-parse all
agree — in-place edits, growth that forces relocation, shared-NPC copy-on-write,
atomic overflow failure, shared-data undo/redo, bounded malformed-input handling,
the packer's dedup/best-fit behaviour, and BPS encode/apply round trips. 103
checks.

`npm run checkrom` runs against the real ROM and is the stronger
check. Current results:

- 215 locations parse; a build with no edits is **byte-identical** to the input.
- Marking every location dirty and rebuilding relocates all 215 and reloads with
  **zero field mismatches** across every parsed field.
- Growing a location to 8×16 screens plus extra spawns round-trips, and no other
  location changes.
- Overflowing the NPC banks warns and returns an image byte-identical to the
  input rather than writing a partial ROM.
- Shops and item names decode as expected: 6 of 11 towns resolve an armor
  shop (the other 5 have none in vanilla), all 11 resolve a tool shop and inn,
  and all 73 item names match their known in-game names.

`npm run checksprites` reports 255 used metasprites (34 mirrored, all
resolvable) and that 1009 of 1227 active spawns draw a sprite with zero
out-of-range CHR references. The remaining 218 are walls, triggers and generic
spawns, which have no graphics in-game either.

`npm run rendermap` renders locations to PNG through the real renderer with a
headless canvas, so the drawing path is exercised outside a browser.

## Disclosure

This project was built AI-assisted. All code was written and reviewed by a
human; AI tools were used as an assistant during development, not as an
unsupervised author.

## Acknowledgments

This project builds directly on research from
[crystalis-randomizer](https://github.com/crystalis-randomizer/crystalis-randomizer)

Specifically:

- **ROM offsets and data layout.** Every offset in the [ROM offsets](#rom-offsets)
  table, and the parse/serialize logic in `src/rom/`, are derived from that
  project's disassembly of the game.
- **Location, object and NPC names.** `src/rom/nametables.ts` is ported from
  crystalis-randomizer's source. Vanilla Crystalis has no in-ROM table for
  these (unlike item names, which this project reads straight from the ROM).
- **Shop town resolution.** A shop's town isn't stored directly in the ROM;
  `src/rom/shop.ts` resolves it by scanning for the shopkeeper NPC placed in
  each candidate location, the same approach as crystalis-randomizer's
  vanilla `Shop` class.

Thanks to Stephen Hicks and contributors for the reverse-engineering work that
made this editor possible.

## Not yet implemented

- Item stat, dialogue and monster-stat editors. Dialogue in particular needs
  the message-text word-compression table ported first (messages currently
  aren't decoded at all, unlike item names).
- Editing metasprites, object stats or NPC appearance records — sprites are
  read-only.
- Screen cloning — painting edits the shared screen rather than allocating a
  new screen id.
- Animated background tiles (the `animation` field is editable but not
  simulated; sprite animation is).
- Freeing space in the NPC-data banks, which caps how many spawns can be added.
