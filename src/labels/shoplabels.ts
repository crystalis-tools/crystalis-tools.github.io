import {NUM_SHOP_TOWNS} from '../rom/constants';
import type {Rom} from '../rom/rom';
import type {ShopTab} from '../state/store';

/** All 34 shop tabs in a fixed order: pawn first, then per-town armor/tool/inn. */
export function allShopTabs(): ShopTab[] {
  const tabs: ShopTab[] = [{shopType: 'pawn'}];
  for (let town = 0; town < NUM_SHOP_TOWNS; town++) {
    tabs.push({shopType: 'armor', town});
    tabs.push({shopType: 'tool', town});
    tabs.push({shopType: 'inn', town});
  }
  return tabs;
}

/**
 * A shop's town isn't named directly in the ROM - derive it from whichever
 * shop at that index resolved a location. The inn always resolves (every
 * town has one), so it is the reliable source.
 */
export function shopTownName(rom: Rom, town: number): string {
  const inn = rom.shops.inns[town];
  if (inn.location >= 0) return rom.location(inn.location).group;
  return `Town ${town}`;
}

export function shopTabLabel(rom: Rom, tab: ShopTab): string {
  if (tab.shopType === 'pawn') return 'Pawn Shop';
  const town = shopTownName(rom, tab.town);
  const kind = tab.shopType === 'armor' ? 'Armor Shop' :
               tab.shopType === 'tool' ? 'Tool Shop' : 'Inn';
  return `${town} ${kind}`;
}

/** Whether this tab's underlying shop resolved a location; the pawn shop is
 *  global and always considered resolved. */
export function shopTabResolved(rom: Rom, tab: ShopTab): boolean {
  if (tab.shopType === 'pawn') return true;
  if (tab.shopType === 'armor') return rom.shops.armorShops[tab.town].location >= 0;
  if (tab.shopType === 'tool') return rom.shops.toolShops[tab.town].location >= 0;
  return rom.shops.inns[tab.town].location >= 0;
}

/** Row index into the shop's underlying armor/tool/inn table, or null for
 *  the pawn shop, which has no single row (it's a 0x49-entry price table). */
export function shopTabIndex(rom: Rom, tab: ShopTab): number | null {
  if (tab.shopType === 'pawn') return null;
  if (tab.shopType === 'armor') return rom.shops.armorShops[tab.town].index;
  if (tab.shopType === 'tool') return rom.shops.toolShops[tab.town].index;
  return rom.shops.inns[tab.town].index;
}
