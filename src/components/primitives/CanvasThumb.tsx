import {useEffect, useRef} from 'react';

export interface CanvasThumbProps {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
  className?: string;
  title?: string;
  onClick?: () => void;
}

/** A canvas that redraws imperatively via `draw` on every render - shared by
 *  every place that draws sprite/tile/icon thumbnails via `src/render/*`. */
export function CanvasThumb({width, height, draw, className, title, onClick}: CanvasThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
  });

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      title={title}
      onClick={onClick}
    />
  );
}
