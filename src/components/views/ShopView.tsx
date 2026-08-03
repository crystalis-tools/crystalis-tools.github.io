import clsx from 'clsx';
import {useState} from 'react';
import {allItemIds, itemLabel} from '../../labels/itemlabels';
import {shopTabLabel, shopTabResolved} from '../../labels/shoplabels';
import {hex} from '../../rom/bytes';
import type {Rom} from '../../rom/rom';
import {useStore} from '../../state/store';
import type {ShopTab} from '../../state/store';
import {Combobox} from '../primitives/Combobox';
import type {ComboboxOption} from '../primitives/Combobox';
import {HexBadge} from '../primitives/HexBadge';
import {
  headerClass, NumberField, panelClass, rowClass, scrollClass, tableClass,
  ViewHeading,
} from './ViewParts';

const EMPTY_ITEM = 0xff;
const shopGrid = 'grid grid-cols-[minmax(0,1fr)_216px] items-center gap-x-7';

function itemOptions(rom: Rom): Array<ComboboxOption<number>> {
  return [EMPTY_ITEM, ...allItemIds()].map(value => {
    const label = value === EMPTY_ITEM ? '— Empty slot —' : itemLabel(rom, value);
    return {
      value,
      label,
      render: (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <HexBadge value={value} dim={value === EMPTY_ITEM} />
          <span className="truncate font-medium">{label}</span>
        </span>
      ),
    };
  });
}

function ShopWarning({rom, tab}: {rom: Rom, tab: ShopTab}) {
  if (shopTabResolved(rom, tab)) return null;
  return (
    <div className="mb-5 max-w-[850px] rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      No shopkeeper for this type was found here — this town has no shop of this kind in vanilla.
      The underlying bytes are still shown and editable, but nothing in-game reads them.
    </div>
  );
}

function PawnPanel({rom, mutate}: {rom: Rom, mutate: (fn: () => void) => void}) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const ids = allItemIds().filter(id => !query ||
      `${hex(id, 2)} ${itemLabel(rom, id)}`.toLowerCase().includes(query));

  return (
    <>
      <input
          type="search"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter items…"
          aria-label="Filter pawn shop items"
          className="mb-3 w-80 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-500 focus:border-blue-500" />
      <div className={tableClass} role="table" aria-label="Pawn shop item prices">
        <div className={clsx(headerClass, shopGrid)} role="row">
          <span role="columnheader">Item</span><span className="text-right" role="columnheader">Sell price</span>
        </div>
        {ids.map(id => {
          const sellPrice = rom.shops.sellPrices[id];
          const label = itemLabel(rom, id);
          return (
            <div key={id} className={clsx(rowClass, shopGrid)} role="row">
              <div className="flex min-w-0 items-center gap-3" role="cell">
                <HexBadge value={id} />
                <span className="truncate font-medium">{label}</span>
              </div>
              <div className="flex items-center gap-2" role="cell">
                <NumberField value={sellPrice} max={0xffff} ariaLabel={`Sell price for ${label}`}
                    onCommit={value => mutate(() => { rom.shops.sellPrices[id] = value & 0xffff; })} />
              </div>
            </div>
          );
        })}
        {ids.length === 0 &&
          <div className="px-5 py-6 text-sm text-neutral-500" role="row">No items match “{filter}”.</div>}
      </div>
    </>
  );
}

function ShopPanel({rom, tab}: {rom: Rom, tab: ShopTab}) {
  const mutate = (fn: () => void) => {
    const store = useStore.getState();
    store.edit('Edit shop', () => { store.touchShops(); fn(); });
  };

  if (tab.shopType === 'pawn') {
    return <PawnPanel rom={rom} mutate={mutate} />;
  }

  if (tab.shopType === 'inn') {
    const inn = rom.shops.inns[tab.town];
    return (
      <>
        <ShopWarning rom={rom} tab={tab} />
        <label className="block w-80 rounded-xl border border-neutral-800 bg-neutral-950/30 p-6">
          <span className="mb-2 block text-sm font-medium text-neutral-400">Nightly price</span>
          <NumberField value={inn.buyPrice} max={0xffff} ariaLabel="Nightly price"
              onCommit={value => mutate(() => { inn.buyPrice = value & 0xffff; })} />
        </label>
      </>
    );
  }

  const shop = tab.shopType === 'armor' ?
      rom.shops.armorShops[tab.town] : rom.shops.toolShops[tab.town];
  const options = itemOptions(rom);
  return (
    <>
      <ShopWarning rom={rom} tab={tab} />
      <div className={clsx(tableClass, 'overflow-visible')} role="table" aria-label="Shop inventory">
        <div className={clsx(headerClass, shopGrid)} role="row">
          <span role="columnheader">Item</span><span className="text-right" role="columnheader">Buy price</span>
        </div>
        {shop.contents.map((item, slot) => {
          const buyPrice = shop.buyPrices[slot];
          return (
            <div key={slot} className={clsx(rowClass, shopGrid)} role="row">
              <div className="flex min-w-0 items-center gap-3" role="cell">
                <span className="w-6 shrink-0 text-right font-mono text-sm text-neutral-600">{slot + 1}</span>
                <Combobox value={item} options={options} ariaLabel={`Item in slot ${slot + 1}`}
                    triggerClassName="min-w-0 flex-1 py-2"
                    onChange={value => mutate(() => { shop.contents[slot] = value & 0xff; })} />
              </div>
              <div className="flex items-center gap-2" role="cell">
                <NumberField value={buyPrice} max={0xffff} ariaLabel={`Buy price for slot ${slot + 1}`}
                    onCommit={value => mutate(() => { shop.buyPrices[slot] = value & 0xffff; })} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ShopView({tab}: {tab: ShopTab}) {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  void revision;
  if (!rom) return null;
  return (
    <div className={panelClass}>
      <ViewHeading>{shopTabLabel(rom, tab)}</ViewHeading>
      <div className={scrollClass}>
        <div className="w-full max-w-[1090px] px-7 pb-12">
          <ShopPanel rom={rom} tab={tab} />
        </div>
      </div>
    </div>
  );
}
