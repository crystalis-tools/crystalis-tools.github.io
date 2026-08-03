/** Small floating info box that follows the cursor, giving a quick peek at
 * an object's key details on hover without requiring a click to select it.
 * Reusable across map object kinds (exits, entrances, spawns, flags, ...) -
 * callers just supply a title and a list of detail lines. */
export function HoverPeek({title, lines, x, y}: {
  title: string, lines: string[], x: number, y: number,
}) {
  return (
    <div className="pointer-events-none fixed z-50 max-w-64 rounded-lg border border-neutral-700 bg-neutral-900/95 px-2 py-1.5 text-xs text-neutral-300 shadow-2xl"
        style={{left: x + 14, top: y + 14}}>
      <div className="font-semibold text-neutral-100">{title}</div>
      {lines.map((line, i) => (
        <div key={i} className="text-neutral-400">{line}</div>
      ))}
    </div>
  );
}
