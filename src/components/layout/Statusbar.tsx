import {useStore} from '../../state/store';

export function Statusbar() {
  const status = useStore(s => s.status);
  const hoverInfo = useStore(s => s.hoverInfo);
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-2 font-mono text-xs text-neutral-400">
      <span className="truncate">{status}</span>
      <span className="truncate">{hoverInfo}</span>
    </div>
  );
}
