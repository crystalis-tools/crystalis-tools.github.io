/**
 * ROM offsets for Crystalis (NES, US).
 *
 * All `PRG_*` constants are offsets into the PRG image, i.e. the ROM file with
 * its 16-byte iNES header stripped.
 */

/** Size of an iNES header. */
export const INES_HEADER_SIZE = 0x10;

/** PRG ROM size (16 banks of 16KB). */
export const PRG_SIZE = 0x40000;

/** Number of location slots in the map data pointer table. */
export const NUM_LOCATIONS = 0x100;

/** Pointer table: MapData for location `id` at `PRG_MAPDATA_PTRS + id*2`. */
export const PRG_MAPDATA_PTRS = 0x14300;

/** Pointer table: NpcData for location `id` at `PRG_NPCDATA_PTRS + id*2`. */
export const PRG_NPCDATA_PTRS = 0x19201;

/** Added to a 16-bit MapData pointer to get a PRG offset. */
export const MAPDATA_PTR_DELTA = 0xc000;

/** Added to a 16-bit NpcData pointer to get a PRG offset. */
export const NPCDATA_PTR_DELTA = 0x10000;

/** MapData lives in segments $0a/$0b. */
export const MAPDATA_ARENA: readonly [number, number] = [0x14000, 0x18000];

/**
 * PRG CRC32 of the vanilla Crystalis (USA) ROM. Loading requires a match so
 * that `Rom.original` is always a known-good BPS diff source — an edited ROM
 * re-loaded as a "vanilla" base would silently corrupt later BPS exports.
 */
export const VANILLA_PRG_CRC = 0x630be870;

/** NpcData lives in segments $0c/$0d. */
export const NPCDATA_ARENA: readonly [number, number] = [0x18000, 0x1c000];

/** Total number of screens, including the 3 extended-plane screens. */
export const NUM_SCREENS = 0x103;

/** Metatile quadrant tables: `PRG_TILESET_TILES | map << 8 | quadrant << 8`. */
export const PRG_TILESET_TILES = 0x10000;

/** Metatile palette-attribute tables (2 bits per metatile, packed). */
export const PRG_TILESET_ATTRS = 0x13000;

/** Metatile flag-alternate tables (32 entries per tileset). */
export const PRG_TILESET_ALTERNATES = 0x13e00;

/** Tile-effect tables, indexed `(id << 8) & 0x1fff | PRG_TILE_EFFECTS`. */
export const PRG_TILE_EFFECTS = 0x12000;

/** Base of the 4-colour background palette table. */
export const PRG_PALETTES = 0x40f0;

/** Per-location checkpoint/saveable flags, one byte per location. */
export const PRG_LOCATION_FLAGS = 0x2ff00;

/** Metasprite pointer table: entry `id` at `PRG_METASPRITES + id*2`. */
export const PRG_METASPRITES = 0x3845c;

/** Added to a 16-bit metasprite pointer to get a PRG offset. */
export const PRG_METASPRITE_WINDOW = 0x30000;

/** Metasprite data below this offset means the slot is unused. */
export const PRG_METASPRITE_MIN = 0x38000;

/** ObjectData pointer table: entry `id` at `PRG_OBJECT_PTRS + id*2`. */
export const PRG_OBJECT_PTRS = 0x1ac00;

/** Added to a 16-bit ObjectData pointer to get a PRG offset. */
export const PRG_OBJECT_WINDOW = 0x10000;

/** NPC appearance records, four bytes each, in banks $04/$05. */
export const PRG_NPC_DATA = 0x80f0;

/** Spawn object ids are stored shifted down by this much. */
export const MONSTER_ID_OFFSET = 0x50;

/** Metasprite drawn for treasure chests, which have no object record. */
export const CHEST_METASPRITE = 0xaa;

/** Sprite palettes live at $b0 + index in the palette table. */
export const SPRITE_PALETTE_BASE = 0xb0;

/** Object AI routines that need special-cased rendering. */
export const enum Action {
  /** Blob; alternates between two unrelated metasprites. */
  BLOB = 0x29,
  /** Directional walker (soldiers and friends). */
  WALKER = 0x2a,
  /** Tower defence mech, same directional scheme as WALKER. */
  TOWER_MECH = 0x5e,
}

/** Valid tileset IDs: $80..$ac step 4. */
export const TILESET_IDS: readonly number[] =
    Array.from({length: 12}, (_, i) => 0x80 + i * 4);

/** Valid tile-effects IDs. */
export const TILE_EFFECTS_IDS: readonly number[] =
    Array.from({length: 11}, (_, i) => 0xb3 + i);

/** A screen is 16 metatiles wide. */
export const SCREEN_WIDTH = 16;

/** A screen is 15 metatiles tall (240px, the NES visible height). */
export const SCREEN_HEIGHT = 15;

/** A metatile is 16x16 pixels. */
export const METATILE_SIZE = 16;

/** Pixel width of one screen. */
export const SCREEN_PX_WIDTH = SCREEN_WIDTH * METATILE_SIZE; // 256

/** Pixel height of one screen. */
export const SCREEN_PX_HEIGHT = SCREEN_HEIGHT * METATILE_SIZE; // 240

/** Maximum layout dimensions (layoutWidth/Height are stored minus one). */
export const MAX_LAYOUT_WIDTH = 8;
export const MAX_LAYOUT_HEIGHT = 16;

/** Tile effect bits. */
export const enum Effect {
  PIT = 0x01,
  NO_WALK = 0x02,
  IMPASSIBLE = 0x04,
  ALTERNATIVE = 0x08,
  BEHIND = 0x10,
  SLOPE = 0x20,
  SLOW = 0x40,
  PAIN = 0x80,
}

/** Spawn type nibble meanings. */
export const SPAWN_TYPES: readonly string[] =
    ['Enemy', 'NPC', 'Chest/Trigger', 'Wall', 'Generic', '?5', '?6', '?7'];

/** Number of item slots (weapons/armor/shields/consumables etc, $00..$48). */
export const NUM_ITEMS = 0x49;

/** Number of shop "towns": 11 clusters of armor/tool/inn/pawn shops. */
export const NUM_SHOP_TOWNS = 11;

/** Rows in the shop location/index search tables. */
export const NUM_SHOP_SLOTS = 33;

/** 11 towns x 4 item slots, item ids ($ff = empty). */
export const PRG_SHOP_ARMOR_ITEMS = 0x21da4;
/** 11 towns x 4 prices, 16-bit words. */
export const PRG_SHOP_ARMOR_PRICES = 0x21dd0;
export const PRG_SHOP_TOOL_ITEMS = 0x21e28;
export const PRG_SHOP_TOOL_PRICES = 0x21e54;
/** 11 towns, one 16-bit price each. */
export const PRG_SHOP_INN_PRICES = 0x21eac;
/** Pawn-shop base price per item id, 16-bit words, `NUM_ITEMS` entries. */
export const PRG_SHOP_PAWN_PRICES = 0x21ec2;
/** Location id for each of the `NUM_SHOP_SLOTS` shop-search rows. */
export const PRG_SHOP_LOCATIONS = 0x21f54;
/** Town index (0..10) for each of the `NUM_SHOP_SLOTS` shop-search rows. */
export const PRG_SHOP_INDICES = 0x21f75;

/** Shopkeeper object's data[25] byte, offset by the shop type (0=armor..3=pawn). */
export const SHOPKEEPER_TYPE_BASE = 0x20;

/** Pointer table: TriggerData for id `n` (0x80..0xc2) at
 *  `PRG_TRIGGER_PTRS + (n & 0x7f)*2`. */
export const PRG_TRIGGER_PTRS = 0x1e17a;

/** Added to a 16-bit TriggerData pointer to get a PRG offset. */
export const TRIGGER_PTR_DELTA = 0x14000;

/** First trigger id; there are `NUM_TRIGGERS` of them, ids $80..$c2. */
export const TRIGGER_ID_BASE = 0x80;

/** Number of trigger slots in the trigger pointer table. */
export const NUM_TRIGGERS = 0x43;

/**
 * Trigger ids that are never spawned in the vanilla ROM - dead data left over
 * from earlier development.
 */
export const UNUSED_TRIGGER_IDS: ReadonlySet<number> = new Set([
  0x87, 0x88, 0x89, 0x8f, 0x93, 0x96, 0x98, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
  0xb5, 0xb9, 0xbe, 0xc0,
]);

/**
 * The exact byte range vanilla devotes to trigger data (the pointer
 * table's targets). Derived empirically the same way as
 * `NPC_DIALOG_ARENA` - starts right after the pointer table, ends where
 * the last trigger's data ends. Packed even tighter than NPC dialogue: at
 * most 2 spare bytes across all 67 triggers combined, so almost any edit
 * that grows a trigger needs something else shortened to make room.
 */
export const TRIGGER_ARENA: readonly [number, number] =
    [PRG_TRIGGER_PTRS + NUM_TRIGGERS * 2, 0x1e3c0];

/** Pointer table: NPC dialogue data for id `n` (0x00..0xc3) at
 *  `PRG_NPC_DIALOG_PTRS + n*2`, in segment $0e (bank $0e, org $8000). */
export const PRG_NPC_DIALOG_PTRS = 0x1c95d;

/** Added to a 16-bit NPC dialogue pointer to get a PRG offset. */
export const NPC_DIALOG_PTR_DELTA = 0x14000;

/** Raw pointer value shared by every NPC with no real dialogue - points at a
 *  single "empty" placeholder table rather than being a null (0) pointer. */
export const NPC_DIALOG_EMPTY_PTR = 0x8b39;

/** First NPC id (bosses and up) with no dialogue pointer slot at all. */
export const NUM_NPC_DIALOG_IDS = 0xc4;

/** Pointer table for per-NPC, per-location visibility requirements. The table
 *  is split around ROM data repurposed by vanilla, but every supported NPC's
 *  pointer is still addressed from this logical base (`id * 2`). */
export const PRG_NPC_VISIBILITY_PTRS = 0x1c5e0;

/** Added to a 16-bit NPC visibility pointer to get a PRG offset. */
export const NPC_VISIBILITY_PTR_DELTA = 0x14000;

/** The fixed region containing the visibility blobs referenced by the table. */
export const NPC_VISIBILITY_ARENA: readonly [number, number] =
    [0x1c77a, PRG_NPC_DIALOG_PTRS];

/**
 * The exact byte range vanilla devotes to NPC dialogue tree data (the
 * pointer table's targets), in the same bank as `PRG_NPC_DIALOG_PTRS`.
 * Derived empirically from the vanilla ROM: starts right after the pointer
 * table, ends where the last dialogue blob ends - everything past that in
 * the bank is unrelated data that must
 * survive untouched, so edited dialogue is repacked only within this range,
 * the same fixed-chunk strategy `compactAll` uses for map/NPC placement
 * data.
 */
export const NPC_DIALOG_ARENA: readonly [number, number] =
    [PRG_NPC_DIALOG_PTRS + NUM_NPC_DIALOG_IDS * 2, 0x1d8f4];

/** Pointer table: item name string for id `n` at `PRG_ITEM_NAMES + n*2`. */
export const PRG_ITEM_NAMES = 0x28a5c;

/** Added to a 16-bit item-name pointer to get a PRG offset. */
export const ITEM_NAME_PTR_DELTA = 0x20000;

/**
 * Dialogue/message text tables, all in banks $14-$17 (segment "14", org
 * $8000 => delta $20000).
 */
/** Pointer table: 0x80 common words (single-byte codes $80..$ff). */
export const PRG_COMMON_WORDS = 0x28900;
/** Pointer table: 10 uncommon words (code $05, index in next byte). */
export const PRG_UNCOMMON_WORDS = 0x28a00;
/** Pointer table: 36 person/place names (code $06, index in next byte). */
export const PRG_PERSON_NAMES = 0x28a14;
export const NUM_UNCOMMON_WORDS = 10;
export const NUM_PERSON_NAMES = 36;
/** Every message-table pointer in banks $14/$15 uses this delta. */
export const MESSAGE_PTR_DELTA_14 = 0x20000;
/** Bank $16 is mapped anomalously (org $a000 instead of $8000). */
export const MESSAGE_PTR_DELTA_16 = 0x22000;
export const MESSAGE_PTR_DELTA_17 = 0x24000;

/** Pointer table: MessageTable_PartNN address for part `p` at
 *  `PRG_MESSAGE_PARTS + p*2`, delta `MESSAGE_PTR_DELTA_14`. */
export const PRG_MESSAGE_PARTS = 0x28422;
/** One byte per part ($15/$16/$17): which bank its messages live in. */
export const PRG_MESSAGE_BANKS = 0x283fe;
/** Number of message parts. */
export const NUM_MESSAGE_PARTS = 0x22;

/**
 * One byte per item: the pattern id of the top-left tile of its menu icon
 * (a 3x3 block of CHR tiles, laid out left-to-right/top-to-bottom starting
 * at that id). Byte values run $80..$ff; see `ITEM_ICON_TILE_BASE`.
 */
export const PRG_ITEM_ICON_TILES = 0x20f5a;

/**
 * Pattern id of an item icon's top-left tile when its ROM byte is $80 (the
 * lowest value seen in practice). A byte's tile is `ITEM_ICON_TILE_BASE +
 * (byte - 0x80)`; confirmed against the real CHR ROM by rendering every
 * item's icon and checking it against its expected shape (sword, orb,
 * shield, armor, ...).
 */
export const ITEM_ICON_TILE_BASE = 3968;

/**
 * One byte per item: flags including the menu icon's palette in the low 2
 * bits. Confirmed by disassembly (`LDA PRG_ITEM_DATA,X ; AND #$03 ; STA
 * $60fa`) feeding a sprite-attribute byte, the same 2-bit-selector pattern
 * `spritePalettes()` already uses - so the real colour is
 * `SPRITE_PALETTE_BASE + (byte & 3)`.
 */
export const PRG_ITEM_DATA = 0x20ff0;

/**
 * Nine bytes: index 0 is unused padding, indices 1-8 are the defense value
 * of shield ids $0d-$14 (`id - 0x0c`). Confirmed against the vanilla ROM:
 * increasing values ending at Psycho Shield's 32.
 */
export const PRG_SHIELD_DEFENSE = 0x34bc9;

/**
 * Nine bytes: index 0 is unused padding, indices 1-8 are the defense value
 * of armor ids $15-$1c (`id - 0x14`). Confirmed against the vanilla ROM:
 * increasing values ending at Psycho Armor's 32.
 */
export const PRG_ARMOR_DEFENSE = 0x34bc0;

/** First/last item ids that are shields (defense via `PRG_SHIELD_DEFENSE`). */
export const FIRST_SHIELD_ID = 0x0d;
export const LAST_SHIELD_ID = 0x14;
/** First/last item ids that are body armor (defense via `PRG_ARMOR_DEFENSE`). */
export const FIRST_ARMOR_ID = 0x15;
export const LAST_ARMOR_ID = 0x1c;
