import {NUM_ITEMS, NUM_SHOP_SLOTS, NUM_SHOP_TOWNS, PRG_SHOP_ARMOR_ITEMS,
        PRG_SHOP_ARMOR_PRICES, PRG_SHOP_INDICES, PRG_SHOP_INN_PRICES,
        PRG_SHOP_LOCATIONS, PRG_SHOP_PAWN_PRICES, PRG_SHOP_TOOL_ITEMS,
        PRG_SHOP_TOOL_PRICES, SHOPKEEPER_TYPE_BASE} from './constants';
import {readLE16, seq, tuple, writeLE16} from './bytes';
import {SpawnType} from './locationtables';
import type {Location} from './location';
import type {Objects} from './objects';

export const enum ShopKind {
  ARMOR = 0,
  TOOL = 1,
  INN = 2,
  PAWN = 3,
}

export interface ShopEntry {
  /** Row 0..10 into the armor/tool item and price tables. */
  index: number;
  /** Location id this shop is placed in, or -1 if it could not be found. */
  location: number;
  /** Four item ids sold here; $ff means the slot is empty. */
  contents: number[];
  /** Four 16-bit buy prices (cost to the player), one per content slot. */
  buyPrices: number[];
}

export interface InnEntry {
  index: number;
  location: number;
  buyPrice: number;
}

/**
 * The 11 armor/tool/inn shops and the pawn shop's universal sell-back prices.
 * Vanilla stores these as fixed-size tables (unlike locations, they never
 * grow), so they are always rewritten in place - see `Rom.attemptBuild`.
 *
 * A shop's location isn't stored directly: the ROM has a 33-row search table
 * (location, town index) and disambiguates which shop type sits at each
 * location by checking the shopkeeper NPC's object data.
 */
export class Shops {
  readonly armorShops: ShopEntry[] = [];
  readonly toolShops: ShopEntry[] = [];
  readonly inns: InnEntry[] = [];
  /** Pawn-shop sell price per item id ($00..$48), shared by every town -
   *  what the player receives for selling that item back. */
  readonly sellPrices: number[];

  constructor(prg: Uint8Array, locations: readonly Location[], objects: Objects) {
    const resolved = resolveShopLocations(prg, locations, objects);

    for (let i = 0; i < NUM_SHOP_TOWNS; i++) {
      const byType = resolved.get(i);
      this.armorShops.push({
        index: i,
        location: byType?.get(ShopKind.ARMOR) ?? -1,
        contents: tuple(prg, PRG_SHOP_ARMOR_ITEMS + i * 4, 4),
        buyPrices: seq(4, j => readLE16(prg, PRG_SHOP_ARMOR_PRICES + (i * 4 + j) * 2)),
      });
      this.toolShops.push({
        index: i,
        location: byType?.get(ShopKind.TOOL) ?? -1,
        contents: tuple(prg, PRG_SHOP_TOOL_ITEMS + i * 4, 4),
        buyPrices: seq(4, j => readLE16(prg, PRG_SHOP_TOOL_PRICES + (i * 4 + j) * 2)),
      });
      this.inns.push({
        index: i,
        location: byType?.get(ShopKind.INN) ?? -1,
        buyPrice: readLE16(prg, PRG_SHOP_INN_PRICES + i * 2),
      });
    }

    this.sellPrices = seq(NUM_ITEMS, id => readLE16(prg, PRG_SHOP_PAWN_PRICES + id * 2));
  }

  write(prg: Uint8Array) {
    for (let i = 0; i < NUM_SHOP_TOWNS; i++) {
      const armor = this.armorShops[i];
      for (let j = 0; j < 4; j++) {
        prg[PRG_SHOP_ARMOR_ITEMS + i * 4 + j] = armor.contents[j] & 0xff;
        writeLE16(prg, PRG_SHOP_ARMOR_PRICES + (i * 4 + j) * 2, armor.buyPrices[j] & 0xffff);
      }
      const tool = this.toolShops[i];
      for (let j = 0; j < 4; j++) {
        prg[PRG_SHOP_TOOL_ITEMS + i * 4 + j] = tool.contents[j] & 0xff;
        writeLE16(prg, PRG_SHOP_TOOL_PRICES + (i * 4 + j) * 2, tool.buyPrices[j] & 0xffff);
      }
      writeLE16(prg, PRG_SHOP_INN_PRICES + i * 2, this.inns[i].buyPrice & 0xffff);
    }
    for (let id = 0; id < NUM_ITEMS; id++) {
      writeLE16(prg, PRG_SHOP_PAWN_PRICES + id * 2, this.sellPrices[id] & 0xffff);
    }
  }
}

/** Town index -> shop type -> location id, resolved via the shopkeeper NPCs. */
function resolveShopLocations(prg: Uint8Array, locations: readonly Location[],
                              objects: Objects): Map<number, Map<ShopKind, number>> {
  const result = new Map<number, Map<ShopKind, number>>();
  for (let i = 0; i < NUM_SHOP_SLOTS; i++) {
    const townIndex = prg[PRG_SHOP_INDICES + i];
    const locationId = prg[PRG_SHOP_LOCATIONS + i];
    const location = locations[locationId];
    if (!location?.used) continue;
    for (const spawn of location.spawns) {
      if (!spawn.used || spawn.type !== SpawnType.GENERIC) continue;
      const obj = objects.get(spawn.id);
      const byte = obj?.data[25] ?? -1;
      if (byte < SHOPKEEPER_TYPE_BASE || byte > SHOPKEEPER_TYPE_BASE + 3) continue;
      const kind = (byte - SHOPKEEPER_TYPE_BASE) as ShopKind;
      let byType = result.get(townIndex);
      if (!byType) result.set(townIndex, byType = new Map());
      byType.set(kind, locationId);
    }
  }
  return result;
}
