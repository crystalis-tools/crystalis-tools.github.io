import {useMemo} from 'react';
import {allItemIds, itemLabel} from '../../labels/itemlabels';
import {messagePickerOptions} from '../../labels/messagelabels';
import {npcLabel} from '../../labels/npclabels';
import {npcDialogSections, updateActionDescription, updateActionGiveItemSlot} from '../../labels/scriptlabels';
import {drawSprite, facingMetasprite, spritePalettes} from '../../render/sprites';
import type {DialogEntry} from '../../rom/objects';
import type {Location} from '../../rom/location';
import type {Spawn} from '../../rom/locationtables';
import type {Rom} from '../../rom/rom';
import {useStore} from '../../state/store';
import {Combobox} from '../primitives/Combobox';
import type {ComboboxOption} from '../primitives/Combobox';
import {HexBadge} from '../primitives/HexBadge';
import {SpriteDropdown} from '../primitives/SpriteDropdown';
import {SignedIdListEditor} from './ScriptBlocks';
import {panelClass, scrollClass, ViewHeading} from './ViewParts';
import {ScriptEditor} from './ScriptEditor';

function giveItemOptions(rom: Rom): Array<ComboboxOption<number>> {
  return allItemIds().map(value => {
    const label = itemLabel(rom, value);
    return {
      value,
      label,
      render: (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <HexBadge value={value} />
          <span className="truncate font-medium">{label}</span>
        </span>
      ),
    };
  });
}

function paintNpc(
    ctx: CanvasRenderingContext2D, rom: Rom, loc: Location, spawn: Spawn,
    metaspriteBase: number) {
  const graphics = useStore.getState().graphics;
  if (!graphics) return;
  drawSprite(ctx, (pattern, palette, flip) => graphics.spriteTile(pattern, palette, flip), rom, {
    metaspriteId: facingMetasprite(metaspriteBase, 0),
    patternPage: loc.spritePatterns[spawn.patternBank] ?? 0,
    palettes: spritePalettes(loc),
    x: 12,
    y: 12,
    label: '',
  }, 0);
}

/** Every location/spawn where this NPC id is actually placed. */
function findPlacements(rom: Rom, id: number): {loc: Location, spawn: Spawn}[] {
  const placements: {loc: Location, spawn: Spawn}[] = [];
  for (const loc of rom.usedLocations) {
    for (const spawn of loc.spawns) {
      if (spawn.used && spawn.isNpc() && spawn.id === id) placements.push({loc, spawn});
    }
  }
  return placements;
}

export function NpcView({id}: {id: number}) {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const messageOptions = useMemo(() => {
    void revision;
    return rom ? messagePickerOptions(rom) : [];
  }, [rom, revision]);
  const giveItemOpts = useMemo(() => {
    void revision;
    return rom ? giveItemOptions(rom) : [];
  }, [rom, revision]);

  if (!rom) return null;
  const npc = rom.npcs.get(id);
  if (!npc) return null;
  // Stable non-null aliases for callbacks rendered by this view.
  const activeRom = rom;
  const activeNpc = npc;
  const label = npcLabel(rom, id);
  const placements = findPlacements(rom, id);
  const singlePlacementLocationId = placements.length === 1 ? placements[0].loc.id : null;
  const previewContext = placements[0] ?? null;
  const metaspriteChoices = [...new Set(rom.npcs.list().map(n => n.metaspriteBase))].sort((a, b) => a - b);
  const visibilityLocationIds = [...new Set([
    ...placements.map(({loc}) => loc.id),
    ...npc.visibility.keys(),
  ])].sort((a, b) => a - b);
  const dialogSections = npcDialogSections(rom, npc);
  const dialogLocationIds = new Set(
      dialogSections.flatMap(section => section.locationId == null ? [] : [section.locationId]));
  const visibilityOnlyLocationIds = visibilityLocationIds.filter(
      locationId => !dialogLocationIds.has(locationId));
  const groupedDialogSections = singlePlacementLocationId == null ? [] :
      dialogSections.filter(section => section.locationId === singlePlacementLocationId);
  const standaloneDialogSections = singlePlacementLocationId == null ? dialogSections :
      dialogSections.filter(section => !groupedDialogSections.includes(section));

  function visibilityEditor(locationId: number) {
    const conditions = activeNpc.visibility.get(locationId) ?? [];
    return (
      <SignedIdListEditor
          ids={conditions}
          title="Visibility"
          hint="The NPC appears here only when all conditions match. Remove every condition to make it always visible."
          mode="condition"
          emptyLabel="Always visible in this location."
          embedded
          onChange={next => {
            const store = useStore.getState();
            store.edit(`Edit visibility for ${label}`, () => {
              store.touchNpcVisibility(id);
              if (next.length) activeNpc.visibility.set(locationId, [...next]);
              else activeNpc.visibility.delete(locationId);
            });
          }} />
    );
  }

  function mapSectionHeader(locationId: number) {
    const location = activeRom.location(locationId);
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-semibold text-neutral-500">Map</span>
        <HexBadge value={locationId} />
        <button type="button"
            onClick={() => useStore.getState().openLocation(locationId)}
            title={`Open ${location.label}`}
            className="truncate text-left text-sm font-semibold text-neutral-200 hover:text-blue-300 hover:underline">
          {location.label}
        </button>
      </div>
    );
  }

  function dialogEditor(sections: typeof dialogSections, embedded = false) {
    return (
      <ScriptEditor
          embedded={embedded}
          emptyLabel="This NPC has no dialog."
          messageOptions={messageOptions}
          sections={sections.map(section => ({
              key: section.key,
              title: section.title,
              header: embedded || section.locationId == null ? undefined :
                  mapSectionHeader(section.locationId),
              leadingContent: embedded || section.locationId == null ||
                  !activeNpc.hasVisibilityPtr ? undefined :
                  visibilityEditor(section.locationId),
              entriesTitle: embedded || section.locationId == null ||
                  !activeNpc.hasVisibilityPtr ? undefined : 'Dialog',
              entries: section.entries,
              allowAlwaysCondition: section.allowAlwaysCondition,
              allowUpdateAction: section.allowUpdateAction,
              describeUpdateAction: id => {
                const slot = updateActionGiveItemSlot(id);
                if (slot == null) return updateActionDescription(id);
                const itemId = slot === 1 ? activeNpc.giveItemSlot1 : activeNpc.giveItemSlot2;
                return `Gives ${itemLabel(activeRom, itemId)} (stored in Slot ${slot}) to the player.`;
              },
              sentenceStyle: true,
              hint: 'Each line shows its message when the condition holds. Drag ⠿ to reorder.',
              getMessageText: ref => activeRom.messages.get(ref.part, ref.index) ?? '',
              onEditMessageText: (index, text) => {
                const ref = section.entries[index].message;
                const store = useStore.getState();
                store.edit(`Edit dialog for ${label}`, () => {
                  store.touchMessage(ref.part, ref.index);
                  activeRom.messages.set(ref.part, ref.index, text);
                });
              },
              onChangeLine: (index, line) => {
                const store = useStore.getState();
                store.edit(`Edit dialog for ${label}`, () => {
                  store.touchNpcDialog(id);
                  section.entries[index] = line;
                });
              },
              onReorder: (from, to) => {
                const store = useStore.getState();
                store.edit(`Reorder dialog for ${label}`, () => {
                  store.touchNpcDialog(id);
                  const [moved] = section.entries.splice(from, 1);
                  section.entries.splice(to, 0, moved);
                });
              },
              onAdd: () => {
                const store = useStore.getState();
                const last = section.entries[section.entries.length - 1];
                const line: DialogEntry = {
                  condition: section.allowAlwaysCondition ? 0 : 1,
                  message: last ? {...last.message} : {part: 0, index: 0},
                  flags: [],
                  updateAction: last?.updateAction ?? 0,
                };
                store.edit(`Add dialog line for ${label}`, () => {
                  store.touchNpcDialog(id);
                  section.entries.push(line);
                });
              },
              onRemove: index => {
                const store = useStore.getState();
                store.edit(`Remove dialog line for ${label}`, () => {
                  store.touchNpcDialog(id);
                  section.entries.splice(index, 1);
                });
              },
          }))} />
    );
  }

  return (
    <div className={panelClass}>
      <ViewHeading>
        <span className="mr-2 align-middle"><HexBadge value={id} /></span>
        {label}
      </ViewHeading>
      <div className={scrollClass}>
        <div className="mx-7 mb-12 max-w-3xl">
          <div className="mb-4 flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-neutral-500">Metasprite</span>
            <SpriteDropdown
                value={npc.metaspriteBase}
                choices={metaspriteChoices.map(value => ({value}))}
                disabled={!previewContext}
                title={`Sprite for ${label}`}
                triggerTitle={previewContext ? `Change ${label}'s sprite` : 'Not placed anywhere in this ROM'}
                draw={(ctx, metasprite) => {
                  if (previewContext) paintNpc(ctx, rom, previewContext.loc, previewContext.spawn, metasprite);
                }}
                onChange={metasprite => {
                  const store = useStore.getState();
                  store.edit('Set NPC sprite', () => {
                    store.touchNpcs();
                    npc.metaspriteBase = metasprite;
                  });
                }} />
          </div>

          <div className="mb-2 flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-neutral-500">Item (Slot 1)</span>
            <Combobox
                value={activeNpc.giveItemSlot1}
                options={giveItemOpts}
                ariaLabel={`${label} give-item slot 1`}
                triggerClassName="w-[220px]"
                onChange={itemId => {
                  const store = useStore.getState();
                  store.edit(`Set ${label}'s give-item (slot 1)`, () => {
                    store.touchNpcs();
                    activeNpc.giveItemSlot1 = itemId;
                  });
                }} />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold text-neutral-500">Item (Slot 2)</span>
            <Combobox
                value={activeNpc.giveItemSlot2}
                options={giveItemOpts}
                ariaLabel={`${label} give-item slot 2`}
                triggerClassName="w-[220px]"
                onChange={itemId => {
                  const store = useStore.getState();
                  store.edit(`Set ${label}'s give-item (slot 2)`, () => {
                    store.touchNpcs();
                    activeNpc.giveItemSlot2 = itemId;
                  });
                }} />
          </div>

          {singlePlacementLocationId != null ? (
            <>
              {visibilityOnlyLocationIds
                  .filter(locationId => locationId !== singlePlacementLocationId)
                  .map(locationId => (
                    <div key={locationId}
                        className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
                      <div className="border-b border-neutral-800 px-4 py-2.5">
                        {mapSectionHeader(locationId)}
                      </div>
                      {visibilityEditor(locationId)}
                    </div>
                  ))}
              <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
                <div className="border-b border-neutral-800 px-4 py-2.5">
                  {mapSectionHeader(singlePlacementLocationId)}
                </div>
                {npc.hasVisibilityPtr ? (
                  <div className="border-b border-neutral-800">
                    {visibilityEditor(singlePlacementLocationId)}
                  </div>
                ) : (
                  <div className="border-b border-neutral-800 px-4 py-3">
                    <span className="text-xs font-semibold text-neutral-500">Visibility</span>
                    <p className="mt-2 text-xs text-neutral-600">
                      This NPC has no editable visibility table.
                    </p>
                  </div>
                )}
                {groupedDialogSections.length > 0 && dialogEditor(groupedDialogSections, true)}
              </div>
            </>
          ) : !npc.hasVisibilityPtr ? (
            <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
              <div className="border-b border-neutral-800 px-4 py-2.5">
                <span className="text-sm font-semibold text-neutral-200">Visibility</span>
              </div>
              <p className="px-4 py-3 text-xs text-neutral-600">
                This NPC has no editable visibility table.
              </p>
            </div>
          ) : visibilityLocationIds.length === 0 && dialogLocationIds.size === 0 ? (
            <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
              <div className="border-b border-neutral-800 px-4 py-2.5">
                <span className="text-sm font-semibold text-neutral-200">Visibility</span>
              </div>
              <p className="px-4 py-3 text-xs text-neutral-600">
                No placements or location-specific visibility rules.
              </p>
            </div>
          ) : visibilityOnlyLocationIds.map(locationId => (
            <div key={locationId}
                className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30">
              <div className="border-b border-neutral-800 px-4 py-2.5">
                {mapSectionHeader(locationId)}
              </div>
              {visibilityEditor(locationId)}
            </div>
          ))}

          {dialogEditor(standaloneDialogSections)}
        </div>
      </div>
    </div>
  );
}
