import clsx from 'clsx';
import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {hex} from '../../rom/bytes';
import {Combobox} from '../primitives/Combobox';
import {HexBadge} from '../primitives/HexBadge';

export const panelClass = 'flex h-full min-h-0 flex-col';
export const headingClass = 'shrink-0 px-7 py-4 text-xl font-semibold text-neutral-100';
export const scrollClass = 'min-h-0 flex-1 overflow-auto';
export const tableClass = 'overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/30';
export const headerClass =
    'min-h-11 border-b border-neutral-800 bg-neutral-900 px-5 text-xs font-semibold uppercase tracking-wider text-neutral-500';
export const rowClass =
    'min-h-16 border-b border-neutral-800 px-5 last:border-b-0 hover:bg-white/[0.02]';
export const focusedClass = 'bg-blue-500/10 shadow-[inset_2px_0_0_#3b82f6]';
export const numericClass =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right font-mono text-sm text-neutral-200 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40';

interface NumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  className?: string;
}

/** Keep typing local and create one undo transaction when the native number
 * input commits (blur/Enter), matching the old DOM `change` behavior. */
export function NumberField({
  value, onCommit, min = 0, max = 0xff, disabled, title, ariaLabel, className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    if (next !== value) onCommit(next);
  }

  return (
    <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className={clsx(numericClass, className)} />
  );
}

interface TextFieldProps {
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  className?: string;
}

/** Keep typing local and create one undo transaction when the text input
 *  commits (blur/Enter), matching `NumberField`'s behavior. */
export function TextField({
  value, onCommit, maxLength, disabled, title, ariaLabel, className,
}: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  return (
    <input
        type="text"
        value={draft}
        maxLength={maxLength}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className={clsx(
            'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-medium ' +
            'text-neutral-200 outline-none focus:border-blue-500 disabled:cursor-not-allowed ' +
            'disabled:opacity-40',
            className)} />
  );
}

interface TextAreaFieldProps {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
  className?: string;
  rows?: number;
}

/** Multi-line counterpart to `TextField`: local draft, committed on blur,
 *  reverted on Escape. Enter inserts a newline rather than committing. */
export function TextAreaField({
  value, onCommit, disabled, title, ariaLabel, className, rows,
}: TextAreaFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function commit() {
    if (draft !== value) onCommit(draft);
  }

  return (
    <textarea
        value={draft}
        rows={rows}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className={clsx(
            'w-full resize-y rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 ' +
            'font-mono text-sm leading-relaxed text-neutral-200 outline-none ' +
            'focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40',
            className)} />
  );
}

export function ViewHeading({children}: {children: ReactNode}) {
  return <div className={headingClass}>{children}</div>;
}

export function Field({label, hint, children, group = false}: {
  label: string, hint?: string, children: ReactNode, group?: boolean,
}) {
  const content = (
    <>
      <span className="mb-1.5 block text-xs font-medium text-neutral-400">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-neutral-600">{hint}</span>}
      {children}
    </>
  );
  if (group) {
    return (
      <div className="mb-4 block min-w-0" role="group" aria-label={label}>
        {content}
      </div>
    );
  }
  return (
    <label className="mb-4 block min-w-0">
      {content}
    </label>
  );
}

export function ActionButton({children, onClick, primary, disabled}: {
  children: ReactNode, onClick: () => void, primary?: boolean, disabled?: boolean,
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
        className={clsx(
            'rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40',
            primary ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500' :
                'border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500')}>
      {children}
    </button>
  );
}

export function IconButton({onClick, label, title}: {onClick: () => void, label: string, title?: string}) {
  return (
    <button type="button" onClick={onClick} title={title ?? label} aria-label={label}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-xs leading-none text-neutral-300 hover:border-neutral-500 hover:text-neutral-100">
      +
    </button>
  );
}

export function idRange(count: number): number[] {
  return Array.from({length: count}, (_, id) => id);
}

export function HexSelect({
  ids, value, onChange, ariaLabel, labelFor, digits = 2, triggerClassName,
}: {
  ids: number[], value: number, onChange: (value: number) => void,
  ariaLabel: string, labelFor?: (id: number) => string | undefined, digits?: number,
  triggerClassName?: string,
}) {
  const options = ids.map(id => {
    const name = labelFor?.(id);
    return {
      value: id,
      label: name ? `0x${hex(id, digits)} ${name}` : `0x${hex(id, digits)}`,
      render: (
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <HexBadge value={id} digits={digits} />
          {name && <span className="truncate">{name}</span>}
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
        triggerClassName={triggerClassName} />
  );
}

/** Scroll a newly focused explorer target into the middle of a retained pane. */
export function useFocusScroll<T extends HTMLElement>(
    attribute: string, focus: string | number | null,
    block: ScrollLogicalPosition = 'center') {
  const container = useRef<T>(null);
  const previous = useRef<string | number | null>(null);
  useEffect(() => {
    if (focus != null && focus !== previous.current) {
      container.current?.querySelector(`[${attribute}="${focus}"]`)
          ?.scrollIntoView({block});
    }
    previous.current = focus;
  }, [attribute, block, focus]);
  return container;
}
