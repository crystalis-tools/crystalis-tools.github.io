import clsx from 'clsx';
import {allNamedFlagIds} from '../../labels/flaglabels';
import {messageHex} from '../../labels/messagelabels';
import {flagLabel} from '../../labels/scriptlabels';
import type {MessageRef} from '../../rom/trigger';
import {Combobox, type ComboboxOption} from '../primitives/Combobox';
import {HexBadge} from '../primitives/HexBadge';
import {HexSelect} from './ViewParts';

export interface MessageOption {
  part: number;
  index: number;
  /** e.g. "0d03 - Welcome to Leaf..." */
  label: string;
}

const NAMED_FLAG_IDS = allNamedFlagIds();

/** Shared visual treatment for signed flag state toggles. */
export const SIGNED_ID_TOGGLE_CLASS = 'rounded px-1.5 py-1 text-[11px] font-medium';

/**
 * Building blocks shared by every script-shaped editor (NPC dialogue,
 * triggers, and anything else that's a list of signed flag ids plus a
 * message): a searchable flag-id picker, a searchable message picker, and
 * a signed-id list editor (conditions or set/clear flags - same shape,
 * different button wording).
 */

/** A flag-id picker: a searchable dropdown of every named flag. Unknown ids
 *  (not in the named list) show up as their own raw entry so the dropdown
 *  always displays the current id correctly. */
export function FlagIdPicker({magnitude, onChange, ariaLabel}: {
  magnitude: number, onChange: (magnitude: number) => void, ariaLabel: string,
}) {
  const ids = NAMED_FLAG_IDS.includes(magnitude) ? NAMED_FLAG_IDS : [magnitude, ...NAMED_FLAG_IDS];
  return (
    <div className="w-[220px] shrink-0">
      <HexSelect
          ids={ids}
          value={magnitude}
          onChange={onChange}
          ariaLabel={ariaLabel}
          labelFor={flagLabel}
          digits={3} />
    </div>
  );
}

/** A dropdown to pick which message a line/trigger shows, searchable by
 *  its hex id or preview text. */
export function MessageRefEditor({value, options, onChange}: {
  value: MessageRef, options: MessageOption[], onChange: (value: MessageRef) => void,
}) {
  const key = (v: MessageRef) => `${v.part}:${v.index}`;
  const comboOptions: ComboboxOption<MessageRef>[] = options.map(o => ({
    value: {part: o.part, index: o.index},
    label: o.label,
    render: (
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <HexBadge text={messageHex(o.part, o.index)} />
        <span className="truncate">{o.label.replace(/^\S+ - /, '')}</span>
      </span>
    ),
  }));
  return (
    <Combobox
        value={value}
        getKey={key}
        options={comboOptions}
        onChange={onChange}
        ariaLabel="Message"
        placeholder="Search messages…"
        triggerClassName="w-[260px]" />
  );
}

export interface FlagChipListEditorProps {
  ids: number[];
  onChange: (ids: number[]) => void;
  label: string;
  min?: number;
  emptyLabel?: string;
}

/** Compact inline chip list of set/clear flags - used per dialogue line,
 *  where a full boxed section per line would be too heavy. */
export function FlagChipListEditor({
  ids, onChange, label, min = 0, emptyLabel = 'nothing',
}: FlagChipListEditorProps) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs font-semibold text-neutral-500">{label}</span>
      {ids.length === 0 && <span className="text-xs text-neutral-600">{emptyLabel}</span>}
      {ids.map((id, i) => {
        const clear = id < 0;
        const magnitude = clear ? ~id : id;
        return (
          <div key={i} className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-1">
            <FlagIdPicker
                magnitude={magnitude}
                ariaLabel={label}
                onChange={next => {
                  const updated = [...ids];
                  updated[i] = clear ? ~next : next;
                  onChange(updated);
                }} />
            <select
                value={clear ? 'clear' : 'set'}
                onChange={e => {
                  const next = [...ids];
                  next[i] = e.target.value === 'clear' ? ~magnitude : magnitude;
                  onChange(next);
                }}
                aria-label="Whether this flag is set or cleared"
                className={clsx(
                    SIGNED_ID_TOGGLE_CLASS,
                    clear ? 'bg-amber-600/20 text-amber-300' : 'bg-emerald-600/20 text-emerald-300')}>
              <option value="set">SET</option>
              <option value="clear">CLEAR</option>
            </select>
            <button
                type="button"
                title="Remove this"
                disabled={ids.length <= min}
                onClick={() => onChange(ids.filter((_, j) => j !== i))}
                className="text-neutral-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30">
              ✕
            </button>
          </div>
        );
      })}
      <button
          type="button"
          onClick={() => onChange([...ids, ids.length ? ids[ids.length - 1] : 1])}
          className="rounded px-1.5 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300">
        + Add
      </button>
    </div>
  );
}

export interface SignedIdListEditorProps {
  ids: number[];
  onChange: (ids: number[]) => void;
  title: string;
  hint: string;
  /** Render as a divider-separated section inside a larger card instead of
   *  as a standalone card. */
  embedded?: boolean;
  /** Button wording for the positive/negative sign - "must be SET/CLEAR"
   *  for a condition, "SET/CLEAR" for an effect (default). */
  mode?: 'condition' | 'effect';
  /** Word shown before the ON/OFF toggle when mode is 'condition' -
   *  defaults to "must be", pass a different string (e.g. "set to") to
   *  override. */
  positiveWord?: string;
  /** Below this many entries, removal is disabled and "+" always stays
   *  enabled to get back above it. Defaults to 0 (list may be emptied). */
  min?: number;
  emptyLabel?: string;
}

/** Boxed list of signed flag ids, editable as numbered rows - used for both
 *  a trigger's "all of these must hold" conditions and (with
 *  `mode="effect"`) its "set/clear these once it fires" effects - same
 *  underlying shape and same box chrome, just worded differently. */
export function SignedIdListEditor({
  ids, onChange, title, hint, mode = 'effect', min = 0, emptyLabel = 'nothing',
  positiveWord = 'must be', embedded = false,
}: SignedIdListEditorProps) {
  const negativeLabel = mode === 'condition' ? 'OFF' : 'CLEAR';
  const positiveLabel = mode === 'condition' ? 'ON' : 'SET';
  return (
    <div className={clsx(
        embedded ? '' :
          'mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30')}>
      <div className={clsx(
          'flex items-center justify-between px-4',
          embedded ? 'pt-3' : 'border-b border-neutral-800 py-2.5')}>
        <span className={clsx(
            'font-semibold',
            embedded ? 'text-xs text-neutral-500' : 'text-sm text-neutral-200')}>
          {title}
        </span>
        <button
            type="button"
            onClick={() => onChange([...ids, ids.length ? ids[ids.length - 1] : 1])}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-xs leading-none text-neutral-300 hover:border-neutral-500 hover:text-neutral-100">
          +
        </button>
      </div>
      <div className={clsx('px-4 pb-3', embedded ? 'pt-2' : 'pt-3')}>
        <p className="mb-3 text-xs text-neutral-600">{hint}</p>
        {ids.length === 0 && <p className="text-xs text-neutral-600">{emptyLabel}</p>}
        <div className="flex flex-col gap-2">
          {ids.map((id, i) => {
            const clear = id < 0;
            const magnitude = clear ? ~id : id;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs text-neutral-600">{i + 1})</span>
                <FlagIdPicker
                    magnitude={magnitude}
                    ariaLabel={title}
                    onChange={next => {
                      const updated = [...ids];
                      updated[i] = clear ? ~next : next;
                      onChange(updated);
                    }} />
                {mode === 'condition' && <span className="text-xs text-neutral-500">{positiveWord}</span>}
                <button
                    type="button"
                    onClick={() => {
                      const next = [...ids];
                      next[i] = clear ? magnitude : ~magnitude;
                      onChange(next);
                    }}
                    title={`Toggle whether this flag ${mode === 'condition' ? 'must be on or off' : 'is set or cleared'}`}
                    className={clsx(
                        SIGNED_ID_TOGGLE_CLASS,
                        clear ? 'bg-amber-600/20 text-amber-300' : 'bg-emerald-600/20 text-emerald-300')}>
                  {clear ? negativeLabel : positiveLabel}
                </button>
                <button
                    type="button"
                    title="Remove this"
                    disabled={ids.length <= min}
                    onClick={() => onChange(ids.filter((_, j) => j !== i))}
                    className="text-neutral-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
