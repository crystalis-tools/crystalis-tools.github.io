import clsx from 'clsx';
import {useState} from 'react';
import type {ReactNode} from 'react';
import {
  UPDATE_ACTION_IDS, updateActionDescription, updateActionLabel,
} from '../../labels/scriptlabels';
import type {DialogEntry} from '../../rom/objects';
import type {MessageRef} from '../../rom/trigger';
import {Combobox} from '../primitives/Combobox';
import type {ComboboxOption} from '../primitives/Combobox';
import {HexBadge} from '../primitives/HexBadge';
import {TextAreaField} from './ViewParts';
import {
  FlagChipListEditor, FlagIdPicker, MessageRefEditor, SIGNED_ID_TOGGLE_CLASS,
  type MessageOption,
} from './ScriptBlocks';

export type {MessageOption} from './ScriptBlocks';

export interface ScriptSection {
  key: string;
  title: string;
  /** Optional richer section heading. The plain title remains the accessible
   *  label used by the editor's controls. */
  header?: ReactNode;
  /** Optional content displayed between the card heading and dialogue. */
  leadingContent?: ReactNode;
  /** Label dialogue separately when the card also contains leading content. */
  entriesTitle?: string;
  hint?: string;
  /** Present the condition and message picker as a readable sentence. */
  sentenceStyle?: boolean;
  entries: DialogEntry[];
  /** Whether "Always" (condition 0) is a legal condition for a new/edited
   *  line in this section - false for sections whose format has no way to
   *  express "always show" (e.g. an NPC's global dialogue). */
  allowAlwaysCondition: boolean;
  /** Whether lines in this section carry a real `updateAction` byte -
   *  false hides the picker entirely (e.g. global dialogue sections). */
  allowUpdateAction?: boolean;
  /** Overrides the static `updateActionDescription` text for a given action
   *  id - used to substitute the actual item name into the give-item
   *  actions' descriptions. Falls back to the static text when omitted. */
  describeUpdateAction?: (id: number) => string | undefined;
  getMessageText: (ref: MessageRef) => string;
  onEditMessageText: (index: number, text: string) => void;
  /** Replace one line wholesale - used for condition/flags/message-ref
   *  edits, each its own undo step. */
  onChangeLine: (index: number, line: DialogEntry) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Below this many lines, removal is disabled. Defaults to 1 - the format
   *  always needs at least one entry to terminate the list. */
  minLines?: number;
}

/**
 * A drag-and-drop "building block" editor for conditional message scripts:
 * NPC dialogue today, anything shaped the same way (a list of
 * condition/message/flags lines, grouped into named sections) later. Each
 * line is a draggable card - reorder by dragging its handle, add/remove with
 * buttons, pick a condition/flags from a searchable list of named flags or
 * type a raw id, and pick which message it shows from a searchable list of
 * every message in the ROM, with its text editable right there.
 *
 * Structural shape (which sections exist, how many lines fit) is owned by
 * the caller; this component only ever calls back with index-based edits,
 * so it stays decoupled from how those edits get undo-tracked or written
 * back to the ROM.
 */
export function ScriptEditor({sections, messageOptions, emptyLabel, embedded = false}: {
  sections: ScriptSection[], messageOptions: MessageOption[], emptyLabel?: string,
  /** Render the sections inside a card supplied by the caller. */
  embedded?: boolean,
}) {
  if (!sections.length) {
    return <p className="text-sm text-neutral-500">{emptyLabel ?? 'No script.'}</p>;
  }
  return (
    <div className="flex flex-col">
      {sections.map(section => (
        <ScriptSectionBlock key={section.key} section={section}
            messageOptions={messageOptions} embedded={embedded} />
      ))}
    </div>
  );
}

function ScriptSectionBlock({section, messageOptions, embedded}: {
  section: ScriptSection, messageOptions: MessageOption[], embedded: boolean,
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragReady, setDragReady] = useState(false);
  const minLines = section.minLines ?? 1;

  function endDrag() {
    setDragIndex(null);
    setOverIndex(null);
    setDragReady(false);
  }

  const addButton = (
    <button
        type="button"
        title="Add line"
        aria-label={`Add line to ${section.title}`}
        onClick={section.onAdd}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-xs leading-none text-neutral-300 hover:border-neutral-500 hover:text-neutral-100">
      +
    </button>
  );

  return (
    <div className={clsx(
        embedded ? 'border-t border-neutral-800 first:border-t-0' :
          'mb-4 rounded-lg border border-neutral-800 bg-neutral-950/30')}>
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        {section.header ?? (
          <span className={clsx(
              'font-semibold',
              embedded ? 'text-xs text-neutral-500' : 'text-sm text-neutral-200')}>
            {section.title}
          </span>
        )}
        {!section.entriesTitle && addButton}
      </div>
      {section.leadingContent && (
        <div className="border-b border-neutral-800">{section.leadingContent}</div>
      )}
      {section.entriesTitle && (
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-xs font-semibold text-neutral-500">{section.entriesTitle}</span>
          {addButton}
        </div>
      )}
      <div className="px-4 py-3">
        {section.hint && (
          <p className="mb-3 text-xs text-neutral-600">{section.hint}</p>
        )}
        {section.entries.length === 0 && (
          <p className="text-xs text-neutral-600">
            No lines in this section yet - click "+" to add one.
          </p>
        )}
        <div className="flex flex-col">
          {section.entries.map((entry, index) => (
            <div
                key={index}
                draggable={dragReady}
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragIndex(index); }}
                onDragOver={e => { e.preventDefault(); setOverIndex(index); }}
                onDragEnd={endDrag}
                onDrop={e => {
                  e.preventDefault();
                  if (dragIndex != null && dragIndex !== index) section.onReorder(dragIndex, index);
                  endDrag();
                }}
                className={clsx(
                    'flex items-start gap-2 border-b border-neutral-800 py-3 transition-opacity ' +
                    'first:pt-0 last:border-b-0 last:pb-0',
                    dragIndex === index && 'opacity-40',
                    overIndex === index && dragIndex !== null && dragIndex !== index &&
                        'bg-blue-500/5 ring-1 ring-inset ring-blue-500')}>
              <span className="flex h-8 w-5 shrink-0 items-center justify-end text-xs text-neutral-600">
                {index + 1})
              </span>
              <div className="flex h-8 w-5 shrink-0 items-center justify-center">
                <button
                    type="button"
                    aria-label={`Drag line ${index + 1} to reorder`}
                    title="Drag to reorder"
                    onPointerDown={() => setDragReady(true)}
                    onPointerUp={() => setDragReady(false)}
                    onPointerCancel={() => setDragReady(false)}
                    className="flex h-8 w-5 cursor-grab select-none items-center justify-center leading-none text-neutral-600 hover:text-neutral-400 active:cursor-grabbing">
                  ⠿
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto">
                    {section.sentenceStyle ? (
                      <>
                        <SentenceConditionEditor
                            value={entry.condition}
                            allowAlways={section.allowAlwaysCondition}
                            onChange={condition => section.onChangeLine(index, {...entry, condition})} />
                        <span className="text-xs font-semibold text-neutral-500">
                          {section.allowAlwaysCondition &&
                              (entry.condition === 0 || entry.condition === -1) ? 'show' : 'then show'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-neutral-500">IF</span>
                        <ConditionEditor
                            value={entry.condition}
                            allowAlways={section.allowAlwaysCondition}
                            onChange={condition => section.onChangeLine(index, {...entry, condition})} />
                        <span className="text-xs font-semibold text-neutral-500">SHOW</span>
                      </>
                    )}
                    <MessageRefEditor
                        value={entry.message}
                        options={messageOptions}
                        onChange={message => section.onChangeLine(index, {...entry, message})} />
                  </div>
                  <button
                      type="button"
                      title="Remove this line"
                      aria-label={`Remove line ${index + 1} from ${section.title}`}
                      disabled={section.entries.length <= minLines}
                      onClick={() => section.onRemove(index)}
                      className={'flex h-8 shrink-0 items-center justify-center rounded px-2 text-xs text-neutral-500 ' +
                          'hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed ' +
                          'disabled:opacity-30'}>
                    {section.sentenceStyle ? '✕' : '✕ Remove'}
                  </button>
                </div>
                <TextAreaField
                    value={section.getMessageText(entry.message)}
                    rows={Math.min(6, Math.max(1, section.getMessageText(entry.message).split('\n').length))}
                    ariaLabel={`${section.title} line ${index + 1} message`}
                    onCommit={text => section.onEditMessageText(index, text)} />
                <FlagChipListEditor
                    ids={entry.flags}
                    label="THEN SET"
                    onChange={flags => section.onChangeLine(index, {...entry, flags})} />
                {section.allowUpdateAction && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 text-xs font-semibold text-neutral-500">ACTION</span>
                    <ActionSelect
                        value={entry.updateAction}
                        onChange={updateAction => section.onChangeLine(index, {...entry, updateAction})}
                        ariaLabel={`${section.title} line ${index + 1} action`}
                        describeAction={section.describeUpdateAction} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Action id picker with a one-line description of what the byte actually
 *  runs in vanilla code, shown under the name in the dropdown and as a
 *  tooltip on the trigger - see `updateActionDescription`. */
function ActionSelect({value, onChange, ariaLabel, describeAction}: {
  value: number, onChange: (value: number) => void, ariaLabel: string,
  describeAction?: (id: number) => string | undefined,
}) {
  const options: Array<ComboboxOption<number>> = UPDATE_ACTION_IDS.map(id => {
    const name = updateActionLabel(id);
    const description = (describeAction ?? updateActionDescription)(id);
    const label = name ? `0x${id.toString(16).padStart(2, '0')} ${name}` : `0x${id.toString(16).padStart(2, '0')}`;
    return {
      value: id,
      label,
      render: (
        <span className="flex min-w-0 flex-1 items-center gap-3" title={description}>
          <HexBadge value={id} digits={2} />
          <span className="min-w-0 flex-1 truncate">
            <span className={clsx(!name && 'text-neutral-500')}>{name ?? '(unnamed)'}</span>
            {description && (
              <span className="ml-2 truncate text-xs text-neutral-500">{description}</span>
            )}
          </span>
        </span>
      ),
    };
  });
  return (
    <Combobox
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={ariaLabel}
        triggerClassName="w-[260px]" />
  );
}

/** Sentence-form condition used by NPC global and location dialogue sections. */
function SentenceConditionEditor({value, allowAlways, onChange}: {
  value: number, allowAlways: boolean, onChange: (value: number) => void,
}) {
  const off = value < 0;
  const magnitude = off ? ~value : value;
  const always = allowAlways && magnitude === 0;
  return (
    <>
      {allowAlways ? (
        <button type="button"
            aria-pressed={always}
            onClick={() => onChange(always ? 1 : 0)}
            title={always ? 'Click to add a condition' : 'Make this line always show'}
            className={clsx(
                'rounded px-1.5 py-0.5 text-xs font-semibold',
                always ? 'bg-blue-600/30 text-blue-300' :
                  'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300')}>
          {always ? 'Always' : 'If'}
        </button>
      ) : (
        <span className="text-xs font-semibold text-neutral-500">If</span>
      )}
      {!always && (
        <>
          <FlagIdPicker
              magnitude={magnitude}
              ariaLabel="Condition flag"
              onChange={next => {
                // Zero means "no global dialogue entry" in the ROM, so a
                // real global condition must remain at least one.
                const clamped = allowAlways ? next : Math.max(1, next);
                onChange(off ? ~clamped : clamped);
              }} />
          <span className="text-xs font-semibold text-neutral-500">is</span>
          <button type="button"
              onClick={() => onChange(off ? magnitude : ~magnitude)}
              title="Toggle whether the flag must be on or off"
              className={clsx(
                  SIGNED_ID_TOGGLE_CLASS,
                  off ? 'bg-amber-600/20 text-amber-300' : 'bg-emerald-600/20 text-emerald-300')}>
            {off ? 'OFF' : 'ON'}
          </button>
        </>
      )}
    </>
  );
}

function ConditionEditor({value, allowAlways, onChange}: {
  value: number, allowAlways: boolean, onChange: (value: number) => void,
}) {
  const clear = value < 0;
  const magnitude = clear ? ~value : value;
  const always = allowAlways && magnitude === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5">
      {allowAlways && (
        <button type="button"
            onClick={() => onChange(always ? 1 : 0)}
            title={always ? 'This line always shows - click to add a condition' : 'Make this line always show'}
            className={clsx(
                'rounded px-1.5 py-0.5 text-[11px] font-medium',
                always ? 'bg-blue-600/30 text-blue-300' : 'text-neutral-500 hover:bg-neutral-800')}>
            Always
        </button>
      )}
      {!always && (
        <>
          <button type="button"
              onClick={() => onChange(clear ? magnitude : ~magnitude)}
              title="Toggle whether the flag must be set or clear"
              className={clsx(
                  SIGNED_ID_TOGGLE_CLASS,
                  clear ? 'bg-amber-600/20 text-amber-300' : 'bg-emerald-600/20 text-emerald-300')}>
            {clear ? 'CLEAR' : 'SET'}
          </button>
          <FlagIdPicker
              magnitude={magnitude}
              ariaLabel="Condition flag"
              onChange={next => {
                // A global section can't express "always" via a real
                // condition (id 0 there means "no entry" and gets dropped
                // on the next reload) - floor it at 1 rather than let that
                // silently happen.
                const clamped = allowAlways ? next : Math.max(1, next);
                onChange(clear ? ~clamped : clamped);
              }} />
        </>
      )}
    </div>
  );
}
