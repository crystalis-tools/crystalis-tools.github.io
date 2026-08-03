import clsx from 'clsx';
import {useState} from 'react';
import {allNamedFlagIds, flagLabel} from '../../labels/flaglabels';
import {findFlagReferences} from '../../labels/flagrefs';
import {useStore} from '../../state/store';
import {HexBadge} from '../primitives/HexBadge';
import {
  focusedClass, headerClass, panelClass, rowClass, scrollClass, tableClass,
  useFocusScroll, ViewHeading,
} from './ViewParts';

const gridClass = 'grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4';

export function FlagsView() {
  const rom = useStore(s => s.rom);
  const focusId = useStore(s => s.focusFlagId);
  const bodyRef = useFocusScroll<HTMLDivElement>('data-flag-id', focusId);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!rom) return null;
  const store = useStore.getState();
  const refs = expandedId != null ? findFlagReferences(rom, expandedId, {
    openTrigger: store.openTrigger, openNpc: store.openNpc, openLocation: store.openLocation,
  }) : [];
  return (
    <div className={panelClass}>
      <ViewHeading>Event Flags</ViewHeading>
      <div ref={bodyRef} className={scrollClass}>
        <div className={clsx(tableClass, 'mx-7 mb-12 max-w-[638px]')} role="table" aria-label="Named flags">
          <div className={clsx(headerClass, gridClass)} role="row">
            <span role="columnheader">Id</span><span role="columnheader">Name</span>
          </div>
          {allNamedFlagIds().map(id => (
            <div key={id}>
              <div role="row" data-flag-id={id}
                  onClick={() => setExpandedId(expandedId === id ? null : id)}
                  className={clsx(rowClass, gridClass, 'cursor-pointer', id === focusId && focusedClass)}>
                <div role="cell"><HexBadge value={id} digits={3} /></div>
                <div role="cell" className="truncate font-medium">{flagLabel(id)}</div>
              </div>
              {expandedId === id && (
                <div className="flex flex-col gap-1 border-b border-neutral-800 bg-neutral-950/30 px-3 py-2">
                  {refs.length === 0 ? (
                    <span className="text-xs text-neutral-500">Not referenced by any trigger, NPC, or map screen.</span>
                  ) : refs.map((ref, i) => (
                    <button key={i} type="button" onClick={ref.onClick}
                        className="truncate rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-xs text-neutral-200 hover:border-neutral-500">
                      {ref.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
