import clsx from 'clsx';
import {useState} from 'react';
import {enemyLabel, findMonsterSpawn, usedMonsterIds} from '../../labels/enemylabels';
import {drawSprite, spritePalettes} from '../../render/sprites';
import type {Location} from '../../rom/location';
import type {Spawn} from '../../rom/locationtables';
import type {Rom} from '../../rom/rom';
import {useStore} from '../../state/store';
import {CanvasThumb} from '../primitives/CanvasThumb';
import {HexBadge} from '../primitives/HexBadge';
import {IconPickerModal} from '../primitives/IconPickerModal';
import {Switch} from '../primitives/Switch';
import {
  focusedClass, headerClass, NumberField, panelClass, rowClass, scrollClass,
  tableClass, useFocusScroll, ViewHeading,
} from './ViewParts';

const gridClass =
    'grid grid-cols-[80px_58px_239px_repeat(3,74px)_repeat(4,67px)_74px_77px_82px_82px_80px_90px_74px_88px_74px] items-center gap-x-3';

function paintMetasprite(
    ctx: CanvasRenderingContext2D, rom: Rom, loc: Location, spawn: Spawn,
    metaspriteId: number) {
  const graphics = useStore.getState().graphics;
  if (!graphics) return;
  drawSprite(
      ctx,
      (pattern, palette, flip) => graphics.spriteTile(pattern, palette, flip),
      rom, {
        metaspriteId,
        patternPage: loc.spritePatterns[spawn.patternBank] ?? 0,
        palettes: spritePalettes(loc),
        x: 16,
        y: 16,
        label: '',
      }, 0);
}

export function EnemiesView() {
  const rom = useStore(s => s.rom);
  const revision = useStore(s => s.revision);
  const focusId = useStore(s => s.focusEnemyId);
  const bodyRef = useFocusScroll<HTMLDivElement>('data-enemy-id', focusId);
  const [pickerObjectId, setPickerObjectId] = useState<number | null>(null);
  void revision;

  if (!rom) return null;
  const ids = usedMonsterIds(rom);
  const pickerId = pickerObjectId;
  const pickerObject = pickerId == null ? null : rom.objects.get(pickerId);
  const pickerContext = pickerId == null ? null : findMonsterSpawn(rom, pickerId);
  const pickerChoices = [...new Set(ids.map(id => rom.objects.get(id)?.metasprite)
      .filter((id): id is number => id != null))].sort((a, b) => a - b);

  return (
    <div className={panelClass}>
      <ViewHeading>Enemies</ViewHeading>
      <div ref={bodyRef} className={scrollClass}>
        <div className={clsx(tableClass, 'mx-7 mb-12 w-max min-w-[2100px]')} role="table" aria-label="All enemies">
          <div className={clsx(headerClass, gridClass)} role="row">
            {[
              ['Id', ''], ['Sprite', ''], ['Name', ''], ['HP', ''], ['ATK', ''], ['DEF', ''],
              ['Lvl', 'Experience level'], ['Spd', 'Movement speed'],
              ['Elem', 'Sword-element immunity bitmask'], ['Gold', 'Gold dropped'],
              ['Exp', 'Experience reward'], ['Poison', 'Poisons on contact'],
              ['Immob', 'Cannot be knocked back'], ['AtkTy', 'Attack type bitmask'],
              ['Status', 'Status effect inflicted'], ['Terrain', 'Terrain susceptibility'],
              ['Child', 'Ad-hoc spawn index for its child object'],
              ['Replace', 'Object id this one turns into'], ['Plane', 'Collision plane'],
            ].map(([label, title]) => <span key={label} title={title} role="columnheader">{label}</span>)}
          </div>
          {ids.map(id => {
            const obj = rom.objects.get(id);
            const context = findMonsterSpawn(rom, id);
            const label = enemyLabel(rom, id);
            const mutate = (fn: () => void) => {
              const store = useStore.getState();
              store.edit('Edit enemy stats', () => { store.touchObjects(); fn(); });
            };
            const stat = (
                name: string, value: number, editable: boolean,
                setValue: (value: number) => void, max = 0xff) => (
              <div role="cell" key={name}>
                <NumberField value={value} max={max} disabled={!editable}
                    title={editable ? undefined : 'Not stored for this object in the ROM'}
                    ariaLabel={`${name} for ${label}`}
                    onCommit={next => mutate(() => setValue(next))} />
              </div>
            );
            const bool = (
                name: string, value: boolean, editable: boolean,
                setValue: (value: boolean) => void) => (
              <div role="cell" key={name}>
                <Switch checked={value} disabled={!editable} ariaLabel={`${name} for ${label}`}
                    title={editable ? name : 'Not stored for this object in the ROM'}
                    onCheckedChange={next => mutate(() => setValue(next))} />
              </div>
            );
            const spriteEditable = (obj?.metaspriteEditable ?? false) && context != null;
            return (
              <div key={id} role="row" data-enemy-id={id}
                  className={clsx(rowClass, gridClass, id === focusId && focusedClass)}>
                <div role="cell"><HexBadge value={id} /></div>
                <div role="cell">
                  <button type="button" disabled={!spriteEditable}
                      title={spriteEditable ? `Change ${label}'s sprite` : 'Not stored for this object in the ROM'}
                      onClick={() => setPickerObjectId(id)}
                      className="size-11 rounded-md border border-neutral-700 bg-black p-0 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40">
                    <CanvasThumb width={32} height={32} className="h-full w-full [image-rendering:pixelated]"
                        draw={ctx => { if (context && obj) paintMetasprite(ctx, rom, context.loc, context.spawn, obj.metasprite); }} />
                  </button>
                </div>
                <div role="cell" className="truncate font-medium">{label}</div>
                {stat('HP', obj?.hp ?? 0, obj?.editable('hp') ?? false, v => { obj!.hp = v; })}
                {stat('ATK', obj?.atk ?? 0, obj?.editable('atk') ?? false, v => { obj!.atk = v; })}
                {stat('DEF', obj?.def ?? 0, obj?.editable('def') ?? false, v => { obj!.def = v; })}
                {stat('Level', obj?.level ?? 0, obj?.editable('level') ?? false, v => { obj!.level = v; }, 0x1f)}
                {stat('Speed', obj?.speed ?? 0, obj?.editable('speed') ?? false, v => { obj!.speed = v; }, 0x0f)}
                {stat('Elements', obj?.elements ?? 0, obj?.editable('elements') ?? false, v => { obj!.elements = v; }, 0x0f)}
                {stat('Gold drop', obj?.goldDrop ?? 0, obj?.editable('goldDrop') ?? false, v => { obj!.goldDrop = v; }, 0x0f)}
                {stat('Exp reward', obj?.expReward ?? 0, obj?.editable('expReward') ?? false, v => { obj!.expReward = v; })}
                {bool('Poison', obj?.poison ?? false, obj?.editable('poison') ?? false, v => { obj!.poison = v; })}
                {bool('Immobile', obj?.immobile ?? false, obj?.editable('immobile') ?? false, v => { obj!.immobile = v; })}
                {stat('Attack type', obj?.attackType ?? 0, obj?.editable('attackType') ?? false, v => { obj!.attackType = v; })}
                {stat('Status effect', obj?.statusEffect ?? 0, obj?.editable('statusEffect') ?? false, v => { obj!.statusEffect = v; }, 0x0f)}
                {stat('Terrain susceptibility', obj?.terrainSusceptibility ?? 0, obj?.editable('terrainSusceptibility') ?? false, v => { obj!.terrainSusceptibility = v; })}
                {stat('Child', obj?.child ?? 0, obj?.editable('child') ?? false, v => { obj!.child = v; })}
                {stat('Replacement', obj?.replacement ?? 0, obj?.editable('replacement') ?? false, v => { obj!.replacement = v; })}
                {stat('Collision plane', obj?.collisionPlane ?? 0, obj?.editable('collisionPlane') ?? false, v => { obj!.collisionPlane = v; }, 0x0f)}
              </div>
            );
          })}
        </div>
      </div>
      <IconPickerModal
          open={pickerObject != null && pickerContext != null}
          title={pickerId == null ? 'Enemy sprite' : `Sprite for ${enemyLabel(rom, pickerId)}`}
          choices={pickerChoices.map(value => ({value}))}
          selected={pickerObject?.metasprite}
          draw={(ctx, metasprite) => {
            if (pickerContext) paintMetasprite(ctx, rom, pickerContext.loc, pickerContext.spawn, metasprite);
          }}
          onOpenChange={open => { if (!open) setPickerObjectId(null); }}
          onPick={metasprite => {
            if (!pickerObject) return;
            const store = useStore.getState();
            store.edit('Set enemy sprite', () => {
              store.touchObjects();
              pickerObject.metasprite = metasprite;
            });
            setPickerObjectId(null);
          }} />
    </div>
  );
}
