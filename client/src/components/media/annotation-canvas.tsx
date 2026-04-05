import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Circle, Square, ArrowUpRight, Undo2, Trash2, Check, X } from "lucide-react";

export interface Annotation {
  type: "freehand" | "circle" | "rect" | "arrow";
  points?: number[][]; // [[x,y], ...] normalized 0-1
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  radiusX?: number;
  radiusY?: number;
  color: string;
}

interface AnnotationCanvasProps {
  onSave: (annotations: Annotation[]) => void;
  onCancel: () => void;
  initialAnnotations?: Annotation[];
  readOnly?: boolean;
  containerWidth: number;
  containerHeight: number;
}

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ffffff"];
const TOOLS = [
  { id: "freehand" as const, icon: Pencil, label: "Draw" },
  { id: "circle" as const, icon: Circle, label: "Circle" },
  { id: "rect" as const, icon: Square, label: "Rectangle" },
  { id: "arrow" as const, icon: ArrowUpRight, label: "Arrow" },
];

export function AnnotationCanvas({
  onSave,
  onCancel,
  initialAnnotations = [],
  readOnly = false,
  containerWidth,
  containerHeight,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [currentTool, setCurrentTool] = useState<"freehand" | "circle" | "rect" | "arrow">("freehand");
  const [currentColor, setCurrentColor] = useState("#ef4444");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const currentPathRef = useRef<number[][]>([]);

  const toNorm = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      ];
    },
    []
  );

  const drawAll = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, list: Annotation[]) => {
      ctx.clearRect(0, 0, w, h);
      for (const a of list) {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (a.type === "freehand" && a.points && a.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(a.points[0][0] * w, a.points[0][1] * h);
          for (let i = 1; i < a.points.length; i++) {
            ctx.lineTo(a.points[i][0] * w, a.points[i][1] * h);
          }
          ctx.stroke();
        } else if (a.type === "circle" && a.x !== undefined && a.y !== undefined) {
          ctx.beginPath();
          ctx.ellipse(
            a.x * w,
            a.y * h,
            (a.radiusX ?? 0) * w,
            (a.radiusY ?? 0) * h,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        } else if (a.type === "rect" && a.x !== undefined && a.y !== undefined) {
          ctx.strokeRect(
            a.x * w,
            a.y * h,
            (a.width ?? 0) * w,
            (a.height ?? 0) * h
          );
        } else if (a.type === "arrow" && a.x !== undefined && a.y !== undefined && a.x2 !== undefined && a.y2 !== undefined) {
          const x1 = a.x * w;
          const y1 = a.y * h;
          const x2 = a.x2 * w;
          const y2 = a.y2 * h;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 16;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(
            x2 - headLen * Math.cos(angle - Math.PI / 6),
            y2 - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(x2, y2);
          ctx.lineTo(
            x2 - headLen * Math.cos(angle + Math.PI / 6),
            y2 - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      }
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    drawAll(ctx, containerWidth, containerHeight, annotations);
  }, [annotations, containerWidth, containerHeight, drawAll]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const [nx, ny] = toNorm(e.clientX, e.clientY);
    setIsDrawing(true);
    setStartPoint({ x: nx, y: ny });
    if (currentTool === "freehand") {
      currentPathRef.current = [[nx, ny]];
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const [nx, ny] = toNorm(e.clientX, e.clientY);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (currentTool === "freehand") {
      currentPathRef.current.push([nx, ny]);
      drawAll(ctx, containerWidth, containerHeight, annotations);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const pts = currentPathRef.current;
      ctx.moveTo(pts[0][0] * containerWidth, pts[0][1] * containerHeight);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * containerWidth, pts[i][1] * containerHeight);
      }
      ctx.stroke();
    } else if (startPoint) {
      drawAll(ctx, containerWidth, containerHeight, annotations);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (currentTool === "circle") {
        const cx = (startPoint.x + nx) / 2;
        const cy = (startPoint.y + ny) / 2;
        const rx = Math.abs(nx - startPoint.x) / 2;
        const ry = Math.abs(ny - startPoint.y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx * containerWidth, cy * containerHeight, rx * containerWidth, ry * containerHeight, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (currentTool === "rect") {
        const x = Math.min(startPoint.x, nx);
        const y = Math.min(startPoint.y, ny);
        const w = Math.abs(nx - startPoint.x);
        const h = Math.abs(ny - startPoint.y);
        ctx.strokeRect(x * containerWidth, y * containerHeight, w * containerWidth, h * containerHeight);
      } else if (currentTool === "arrow") {
        const x1 = startPoint.x * containerWidth;
        const y1 = startPoint.y * containerHeight;
        const x2 = nx * containerWidth;
        const y2 = ny * containerHeight;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 16;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const [nx, ny] = toNorm(e.clientX, e.clientY);

    let newAnnotation: Annotation | null = null;

    if (currentTool === "freehand") {
      if (currentPathRef.current.length > 1) {
        newAnnotation = { type: "freehand", points: [...currentPathRef.current], color: currentColor };
      }
      currentPathRef.current = [];
    } else if (startPoint) {
      if (currentTool === "circle") {
        const cx = (startPoint.x + nx) / 2;
        const cy = (startPoint.y + ny) / 2;
        const rx = Math.abs(nx - startPoint.x) / 2;
        const ry = Math.abs(ny - startPoint.y) / 2;
        if (rx > 0.005 || ry > 0.005) {
          newAnnotation = { type: "circle", x: cx, y: cy, radiusX: rx, radiusY: ry, color: currentColor };
        }
      } else if (currentTool === "rect") {
        const w = Math.abs(nx - startPoint.x);
        const h = Math.abs(ny - startPoint.y);
        if (w > 0.005 || h > 0.005) {
          newAnnotation = { type: "rect", x: Math.min(startPoint.x, nx), y: Math.min(startPoint.y, ny), width: w, height: h, color: currentColor };
        }
      } else if (currentTool === "arrow") {
        const dist = Math.hypot(nx - startPoint.x, ny - startPoint.y);
        if (dist > 0.01) {
          newAnnotation = { type: "arrow", x: startPoint.x, y: startPoint.y, x2: nx, y2: ny, color: currentColor };
        }
      }
    }

    if (newAnnotation) {
      setAnnotations((prev) => [...prev, newAnnotation!]);
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setAnnotations([]);
  };

  if (readOnly) {
    return (
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: containerWidth, height: containerHeight }}
      />
    );
  }

  return (
    <div className="absolute inset-0" style={{ zIndex: 30 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ width: containerWidth, height: containerHeight, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/80 backdrop-blur rounded-lg px-2 py-1.5 shadow-lg" style={{ zIndex: 31 }}>
        {TOOLS.map((tool) => (
          <Button
            key={tool.id}
            variant={currentTool === tool.id ? "default" : "ghost"}
            size="icon"
            className={`h-8 w-8 ${currentTool === tool.id ? "bg-[#026d55] hover:bg-[#015c47] text-white" : "text-gray-300 hover:text-white"}`}
            onClick={() => setCurrentTool(tool.id)}
            title={tool.label}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        ))}

        <div className="w-px h-6 bg-gray-600 mx-1" />

        {COLORS.map((color) => (
          <button
            key={color}
            className={`h-6 w-6 rounded-full border-2 transition-transform ${currentColor === color ? "border-white scale-110" : "border-transparent"}`}
            style={{ backgroundColor: color }}
            onClick={() => setCurrentColor(color)}
          />
        ))}

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-300 hover:text-white" onClick={handleUndo} disabled={annotations.length === 0} title="Undo">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-300 hover:text-white" onClick={handleClear} disabled={annotations.length === 0} title="Clear all">
          <Trash2 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-300 hover:text-white" onClick={onCancel} title="Cancel">
          <X className="h-4 w-4" />
        </Button>
        <Button
          variant="default"
          size="icon"
          className="h-8 w-8 bg-[#026d55] hover:bg-[#015c47] text-white"
          onClick={() => onSave(annotations)}
          disabled={annotations.length === 0}
          title="Done"
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AnnotationOverlay({
  annotations,
  containerWidth,
  containerHeight,
}: {
  annotations: Annotation[];
  containerWidth: number;
  containerHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = containerWidth;
    canvas.height = containerHeight;
    ctx.clearRect(0, 0, containerWidth, containerHeight);

    for (const a of annotations) {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (a.type === "freehand" && a.points && a.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(a.points[0][0] * containerWidth, a.points[0][1] * containerHeight);
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i][0] * containerWidth, a.points[i][1] * containerHeight);
        }
        ctx.stroke();
      } else if (a.type === "circle" && a.x !== undefined && a.y !== undefined) {
        ctx.beginPath();
        ctx.ellipse(a.x * containerWidth, a.y * containerHeight, (a.radiusX ?? 0) * containerWidth, (a.radiusY ?? 0) * containerHeight, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (a.type === "rect" && a.x !== undefined && a.y !== undefined) {
        ctx.strokeRect(a.x * containerWidth, a.y * containerHeight, (a.width ?? 0) * containerWidth, (a.height ?? 0) * containerHeight);
      } else if (a.type === "arrow" && a.x !== undefined && a.y !== undefined && a.x2 !== undefined && a.y2 !== undefined) {
        const x1 = a.x * containerWidth;
        const y1 = a.y * containerHeight;
        const x2 = a.x2 * containerWidth;
        const y2 = a.y2 * containerHeight;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 16;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  }, [annotations, containerWidth, containerHeight]);

  if (!annotations.length) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight, zIndex: 20 }}
    />
  );
}
