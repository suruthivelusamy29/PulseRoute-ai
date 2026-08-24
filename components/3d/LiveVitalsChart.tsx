"use client";

import { useEffect, useRef } from "react";

interface VitalsPoint {
  t: number;
  bpm: number;
  o2: number;
}

interface LiveVitalsChartProps {
  points: VitalsPoint[];
}

const W = 600;
const H = 120;
const MAX_POINTS = 60;

function drawLine(
  ctx: CanvasRenderingContext2D,
  points: VitalsPoint[],
  key: "bpm" | "o2",
  min: number,
  max: number,
  color: string
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  points.forEach((p, i) => {
    const x = (i / (MAX_POINTS - 1)) * W;
    const y = H - ((p[key] - min) / (max - min)) * (H - 16) - 8;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

export default function LiveVitalsChart({ points }: LiveVitalsChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const visible = points.slice(-MAX_POINTS);
    drawLine(ctx, visible, "bpm", 40, 180, "#EF4444");
    drawLine(ctx, visible, "o2", 70, 100, "#3B82F6");

    // Labels
    ctx.font = "10px monospace";
    ctx.fillStyle = "#EF4444";
    ctx.fillText("BPM", 4, 12);
    ctx.fillStyle = "#3B82F6";
    ctx.fillText("SpO₂", 4, 24);

    if (visible.length > 0) {
      const last = visible[visible.length - 1];
      ctx.fillStyle = "#EF4444";
      ctx.fillText(String(last.bpm), W - 36, 12);
      ctx.fillStyle = "#3B82F6";
      ctx.fillText(`${last.o2}%`, W - 36, 24);
    }
  }, [points]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="w-full rounded-xl bg-gray-950 border border-gray-800"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
