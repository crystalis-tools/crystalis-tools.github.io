import clsx from 'clsx';
import {hex} from '../../rom/bytes';

export interface HexBadgeProps {
  value?: number;
  text?: string;
  digits?: number;
  dim?: boolean;
  className?: string;
}

/** A small "0x00" badge for a raw ROM value, used throughout the spreadsheet
 *  views and reference lists. Pass `text` instead of `value` for an
 *  already-formatted hex string (e.g. one produced by a labels helper). */
export function HexBadge({value, text, digits = 2, dim, className}: HexBadgeProps) {
  return (
    <code
        className={clsx(
            'rounded bg-neutral-700 px-1 py-0.5 font-mono text-[11px]',
            dim ? 'text-amber-400/60' : 'text-amber-400',
            className)}>
      0x{text ?? hex(value!, digits)}
    </code>
  );
}
