import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';

export interface Stroke {
  points: Array<{ x: number; y: number; t: number }>;
}

export interface SketchCanvasHandle {
  getStrokes: () => Stroke[];
  getPngDataUrl: () => string;
}

/** Normalized point (0–1) so strokes survive canvas resize */
interface NormPoint {
  x: number;
  y: number;
  t: number;
}

export const SketchCanvas = forwardRef<SketchCanvasHandle>(function SketchCanvas(
  _props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStroke = useRef<NormPoint[] | null>(null);
  const isDrawing = useRef(false);

  const redraw = useCallback(
    (strokesToDraw: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#e4e6ef';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const w = canvas.width;
      const h = canvas.height;
      for (const stroke of strokesToDraw) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        const p0 = stroke.points[0];
        ctx.moveTo(p0.x * w, p0.y * h);
        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x * w, p.y * h);
        }
        ctx.stroke();
      }
    },
    [],
  );

  // Resize canvas to match display size and set initial size before first draw
  const setCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  const strokesRef = useRef<Stroke[]>([]);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useLayoutEffect(() => {
    setCanvasSize();
    const canvas = canvasRef.current;
    if (canvas) redraw(strokesRef.current);
  }, [setCanvasSize, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw(strokesRef.current);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [redraw]);

  const getNormalizedPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): NormPoint => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, t: Date.now() };
      const rect = canvas.getBoundingClientRect();
      const x = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
      const y = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        t: Date.now(),
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      isDrawing.current = true;
      currentStroke.current = [getNormalizedPoint(e)];
      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    [getNormalizedPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current || !currentStroke.current) return;
      const pt = getNormalizedPoint(e);
      currentStroke.current.push(pt);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pts = currentStroke.current;
      if (pts.length < 2) return;
      const w = canvas.width;
      const h = canvas.height;
      const prev = pts[pts.length - 2];
      ctx.strokeStyle = '#e4e6ef';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x * w, prev.y * h);
      ctx.lineTo(pt.x * w, pt.y * h);
      ctx.stroke();
    },
    [getNormalizedPoint],
  );

  const onPointerUp = useCallback(() => {
    if (!isDrawing.current || !currentStroke.current) return;
    isDrawing.current = false;
    const norm = currentStroke.current;
    if (norm.length > 1) {
      setStrokes((prev) => [...prev, { points: norm }]);
    }
    currentStroke.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      redraw(next);
      return next;
    });
  }, [redraw]);

  const handleClear = useCallback(() => {
    setStrokes([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getStrokes: () => strokes,
      getPngDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? '',
    }),
    [strokes],
  );

  return (
    <div className="sketch-wrapper">
      <div className="sketch-toolbar">
        <span className="sketch-label">Sketch Pad</span>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleUndo}
          disabled={strokes.length === 0}
        >
          Undo
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleClear}
          disabled={strokes.length === 0}
        >
          Clear
        </button>
      </div>
      <div className="sketch-canvas-container">
        <canvas
          ref={canvasRef}
          className="sketch-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
});
