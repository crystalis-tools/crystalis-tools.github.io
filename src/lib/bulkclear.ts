import {showDialog} from '../components/primitives/Dialog';
import {seq} from '../rom/bytes';
import {useStore} from '../state/store';

/** Confirm, then run a bulk edit if the user accepts. Every "Clear all"
 *  tool goes through this - they're broad, one-shot actions that are easy
 *  to trigger by accident, so they always get a chance to back out even
 *  though (unlike a plain destructive action) the result is still on the
 *  undo stack afterward. */
function confirmAndRun(title: string, message: string, run: () => void) {
  showDialog(title, message, 'error', [
    {label: 'Cancel', run: () => {}},
    {label: 'Clear', primary: true, run},
  ]);
}

/** Wipes every used location back to a blank room: no spawns, no screen
 *  flags, no pits, and a screen grid reset to a single blank screen id -
 *  a clean canvas to place custom content on top of the existing tileset.
 *  Entrances/exits are left alone, since clearing those would disconnect
 *  the map from the rest of the world rather than just clear its content.
 *
 *  Each location is its own undo step (the undo system only tracks one
 *  location at a time), so this briefly opens every location as a tab to
 *  edit it, then closes them all again once done.
 */
export function clearAllMaps() {
  const store = useStore.getState();
  const rom = store.rom;
  if (!rom) return;
  confirmAndRun(
      'Clear all maps',
      `This resets all ${rom.usedLocations.length} maps to a blank screen grid ` +
      'with no spawns, flags, or pits. Entrances and exits are kept. ' +
      'Each map is still undoable individually afterward.',
      () => {
        for (const loc of rom.usedLocations) {
          store.openLocation(loc.id);
          store.edit(`Clear map $${loc.id.toString(16).padStart(2, '0')}`, () => {
            loc.spawns = [];
            loc.flags = [];
            loc.pits = [];
            // `resize()` only fills newly-grown cells, so calling it at the
            // same dimensions is a no-op - build the blank grid directly.
            loc.screens = seq(loc.height, () => seq(loc.width, () => loc.plane));
            loc.dirty = true;
          });
        }
        store.closeAllTabs();
        store.setStatus(`Cleared ${rom.usedLocations.length} maps.`);
      });
}

/** Blanks every message's text (NPC dialogue, system text), keeping the
 *  message table's part/index structure untouched. */
export function clearAllMessages() {
  const store = useStore.getState();
  const rom = store.rom;
  if (!rom) return;
  confirmAndRun(
      'Clear all messages',
      'This blanks the text of every message in the ROM - NPC dialogue and ' +
      'system text alike - to an empty string.',
      () => {
        let count = 0;
        store.edit('Clear all messages', () => {
          for (const {part, index} of rom.messages.entries()) {
            if (!rom.messages.get(part, index)) continue;
            store.touchMessage(part, index);
            rom.messages.set(part, index, '');
            count++;
          }
        });
        store.setStatus(`Cleared ${count} messages.`);
      });
}

/** Empties every armor/tool shop's inventory slots. Inn/pawn prices are
 *  left alone - they aren't "content" the way a shop's item list is. */
export function clearAllShops() {
  const store = useStore.getState();
  const rom = store.rom;
  if (!rom) return;
  confirmAndRun(
      'Clear all shops',
      'This empties every armor and tool shop\'s item slots. Inn and ' +
      'pawn-shop prices are left as-is.',
      () => {
        store.edit('Clear all shops', () => {
          store.touchShops();
          for (const shop of [...rom.shops.armorShops, ...rom.shops.toolShops]) {
            shop.contents.fill(0xff);
            shop.buyPrices.fill(0);
          }
        });
        store.setStatus('Cleared all shop inventories.');
      });
}
