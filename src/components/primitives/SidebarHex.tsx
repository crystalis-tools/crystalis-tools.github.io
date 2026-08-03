import clsx from 'clsx';

export interface SidebarHexProps {
  text: string;
  /** Skip the "0x" prefix, e.g. for already-delimited "part:index" text. */
  raw?: boolean;
  className?: string;
}

/** A quiet, no-background hex tag for tree/list rows (e.g. the Explorer
 *  sidebar), where a full HexBadge is too loud next to the row label. */
export function SidebarHex({text, raw, className}: SidebarHexProps) {
  return (
    <code className={clsx('font-mono text-[11px] text-neutral-500', className)}>
      {raw ? text : `0x${text}`}
    </code>
  );
}
