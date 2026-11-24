/**
 * Helper to compute mouse/touch coordinates in logical CSS pixels relative to canvas.
 */
export function getCanvasPointerPos(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

/**
 * Scales a canvas cleanly to devicePixelRatio matching its parent layout box.
 */
export function syncCanvasDpr(canvas: HTMLCanvasElement): {
  width: number;
  height: number;
  dpr: number;
  ctx: CanvasRenderingContext2D | null;
} {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const width = Math.max(100, Math.floor(rect.width));
  const height = Math.max(100, Math.floor(rect.height));
  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { width, height, dpr, ctx };
}
