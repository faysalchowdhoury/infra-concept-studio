import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Layers } from 'lucide-react';
import {
  FOS_OVERTURNING_REQ,
  FOS_SLIDING_REQ,
  GeotechWallParams,
  GeotechWallResult,
  WORST_CASE_GEOTECH_PARAMS,
  solveGeotechWall,
} from '../physics/geotechWallSolver';
import { ParameterSlider } from '../components/ParameterSlider';
import { ComplianceBadge } from '../components/ComplianceBadge';
import { MetricCell } from '../components/MetricCell';
import { getCanvasPointerPos, syncCanvasDpr } from '../components/canvasUtils';

interface GeotechWallModuleProps {
  params: GeotechWallParams;
  onChange: (next: GeotechWallParams) => void;
}

type DragTarget = 'water' | 'surcharge' | null;

export const GeotechWallModule: React.FC<GeotechWallModuleProps> = ({ params, onChange }) => {
  const result: GeotechWallResult = useMemo(() => solveGeotechWall(params), [params]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragTargetRef = useRef<DragTarget>(null);
  const [hoverTarget, setHoverTarget] = useState<DragTarget>(null);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const resultRef = useRef(result);
  resultRef.current = result;

  useEffect(() => {
    let rafId = 0;
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const { width, height, ctx } = syncCanvasDpr(canvas);
        if (ctx) {
          drawGeotechWall(
            ctx,
            width,
            height,
            now / 1000,
            paramsRef.current,
            resultRef.current
          );
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const getTransform = (width: number, height: number) => {
    const H = params.wallHeightM;
    const B = params.baseWidthM;
    const pxPerM = Math.min((height * 0.56) / H, (width * 0.42) / B);
    const originX = width * 0.28; // Toe x = 0
    const originY = height * 0.72; // Base bottom y = 0
    return { pxPerM, originX, originY };
  };

  const hitTestTarget = (x: number, y: number, width: number, height: number): DragTarget => {
    const { pxPerM, originX, originY } = getTransform(width, height);
    const geom = result.geometry;

    // Surcharge block center
    const surX = originX + (geom.stemBackXM + params.surchargeOffsetM + 1.0) * pxPerM;
    const surY = originY - params.wallHeightM * pxPerM - 16;
    if (Math.abs(x - surX) <= 44 && Math.abs(y - surY) <= 28) {
      return 'surcharge';
    }

    // Water table line in backfill
    const wtY = originY - Math.min(params.wallHeightM, params.waterTableHeightM) * pxPerM;
    const stemBackPx = originX + geom.stemBackXM * pxPerM;
    if (x >= stemBackPx - 16 && Math.abs(y - wtY) <= 16) {
      return 'water';
    }
    return null;
  };

  const applyDrag = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !dragTargetRef.current) return;
    const { x, y } = getCanvasPointerPos(canvas, clientX, clientY);
    const rect = canvas.getBoundingClientRect();
    const { pxPerM, originX, originY } = getTransform(rect.width, rect.height);
    const geom = result.geometry;

    if (dragTargetRef.current === 'water') {
      const hWater = Math.max(
        0,
        Math.min(params.wallHeightM, (originY - y) / pxPerM)
      );
      onChange({
        ...params,
        waterTableHeightM: Math.round(hWater * 10) / 10,
      });
    } else if (dragTargetRef.current === 'surcharge') {
      const worldX = (x - originX) / pxPerM;
      const offset = Math.max(0, Math.min(4.0, worldX - geom.stemBackXM - 1.0));
      const worldTopY = originY - params.wallHeightM * pxPerM;
      const liftPx = worldTopY - y;
      const newSurcharge = Math.max(0, Math.min(30, Math.round(liftPx * 0.55)));
      onChange({
        ...params,
        surchargeOffsetM: Math.round(offset * 10) / 10,
        surchargeKpa: newSurcharge,
      });
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    const target = hitTestTarget(x, y, rect.width, rect.height);
    if (target) {
      dragTargetRef.current = target;
      canvas.setPointerCapture(e.pointerId);
      applyDrag(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (dragTargetRef.current) {
      applyDrag(e.clientX, e.clientY);
      return;
    }
    const { x, y } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    setHoverTarget(hitTestTarget(x, y, rect.width, rect.height));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragTargetRef.current) {
      dragTargetRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-3">
      {/* Left Panel (320px) */}
      <aside className="w-full lg:w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Wall & Backfill Inputs</h2>
            <p className="text-[11px] text-slate-500">Rankine Active & Footing Stability</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...WORST_CASE_GEOTECH_PARAMS })}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            Worst-Case Sweep
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <ParameterSlider
            label="Wall Height (H)"
            value={params.wallHeightM}
            min={3.0}
            max={10.0}
            step={0.2}
            precision={1}
            unit="m"
            onChange={(v) =>
              onChange({
                ...params,
                wallHeightM: v,
                waterTableHeightM: Math.min(params.waterTableHeightM, v),
              })
            }
          />
          <ParameterSlider
            label="Base Slab Width (B)"
            value={params.baseWidthM}
            min={2.0}
            max={8.0}
            step={0.1}
            precision={1}
            unit="m"
            onChange={(v) => onChange({ ...params, baseWidthM: v })}
          />
          <ParameterSlider
            label="Backfill Friction Angle (φ)"
            value={params.frictionAngleDeg}
            min={26}
            max={40}
            step={0.5}
            precision={1}
            unit="°"
            onChange={(v) => onChange({ ...params, frictionAngleDeg: v })}
          />
          <ParameterSlider
            label="Soil Unit Weight (γ)"
            value={params.soilUnitWeightKnM3}
            min={16.0}
            max={21.0}
            step={0.5}
            precision={1}
            unit="kN/m³"
            onChange={(v) => onChange({ ...params, soilUnitWeightKnM3: v })}
          />
          <ParameterSlider
            label="Allowable Bearing (q_allow)"
            value={params.allowableBearingKpa}
            min={100}
            max={400}
            step={10}
            unit="kPa"
            onChange={(v) => onChange({ ...params, allowableBearingKpa: v })}
          />
          <ParameterSlider
            label="Groundwater Table (h_w)"
            value={params.waterTableHeightM}
            min={0}
            max={params.wallHeightM}
            step={0.1}
            precision={1}
            unit="m"
            hint="Synced w/ drag"
            onChange={(v) => onChange({ ...params, waterTableHeightM: v })}
          />
          <ParameterSlider
            label="Traffic Surcharge (q_s)"
            value={params.surchargeKpa}
            min={0}
            max={30}
            step={1}
            unit="kPa"
            hint={`Offset ${params.surchargeOffsetM.toFixed(1)}m`}
            onChange={(v) => onChange({ ...params, surchargeKpa: v })}
          />
        </div>
      </aside>

      {/* Center Stage (Flexible) */}
      <section className="flex-1 min-h-[380px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-900" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Cantilever Wall 2D Cross-Section & Soil Pressure Distribution
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            Drag Water Table line & Surcharge block
          </span>
        </div>

        <div className="relative flex-1 min-h-[320px] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              dragTargetRef.current = null;
              setHoverTarget(null);
            }}
            className={`h-full w-full touch-none ${
              dragTargetRef.current === 'water' || hoverTarget === 'water'
                ? 'cursor-ns-resize'
                : dragTargetRef.current === 'surcharge' || hoverTarget === 'surcharge'
                  ? 'cursor-move'
                  : 'cursor-default'
            }`}
          />
        </div>
      </section>

      {/* Right Panel (340px) */}
      <aside className="w-full lg:w-[340px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Simultaneous Stability Checks
          </h3>
          <div className="mt-2 space-y-2">
            <ComplianceBadge
              title="Overturning Stability"
              pass={result.overturningPass}
              valueText={`FoS = ${result.fosOverturning.toFixed(2)}`}
              thresholdText={`≥ ${FOS_OVERTURNING_REQ.toFixed(1)}`}
              marginText={`${result.overturningMargin >= 0 ? '+' : ''}${result.overturningMargin.toFixed(2)}`}
            />
            <ComplianceBadge
              title="Sliding Stability"
              pass={result.slidingPass}
              valueText={`FoS = ${result.fosSliding.toFixed(2)}`}
              thresholdText={`≥ ${FOS_SLIDING_REQ.toFixed(1)}`}
              marginText={`${result.slidingMargin >= 0 ? '+' : ''}${result.slidingMargin.toFixed(2)}`}
            />
            <ComplianceBadge
              title="Bearing & Middle-Third"
              pass={result.bearingPass}
              valueText={
                Number.isFinite(result.qMaxKpa)
                  ? `${result.qMaxKpa.toFixed(1)} kPa`
                  : 'UPLIFT'
              }
              thresholdText={`≤ ${params.allowableBearingKpa} kPa & |e|≤${result.middleThirdLimitM.toFixed(2)}m`}
              marginText={
                !result.inMiddleThird
                  ? `Outside mid-third (|e|=${Math.abs(result.eccentricityM).toFixed(2)}m)`
                  : `${result.bearingMarginKpa >= 0 ? '+' : ''}${result.bearingMarginKpa.toFixed(1)} kPa`
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="Rankine Ka"
            value={result.ka.toFixed(3)}
            sub={`μ_base = ${result.baseFrictionCoeff.toFixed(3)}`}
          />
          <MetricCell
            label="Total Thrust P_H"
            value={`${result.totalHorizontalForceKnM.toFixed(1)} kN/m`}
            sub={`Water: ${result.hydrostaticThrustKnM.toFixed(1)} kN/m`}
          />
          <MetricCell
            label="Vertical Load ΣV"
            value={`${result.totalVerticalForceKnM.toFixed(1)} kN/m`}
            sub={`q_min: ${result.qMinKpa.toFixed(1)} kPa`}
          />
          <MetricCell
            label="Eccentricity e"
            value={`${result.eccentricityM.toFixed(2)} m`}
            sub={`Limit B/6 = ${result.middleThirdLimitM.toFixed(2)} m`}
          />
        </div>

        <GeotechSummaryChart result={result} allowableBearingKpa={params.allowableBearingKpa} />
      </aside>
    </div>
  );
};

const GeotechSummaryChart: React.FC<{
  result: GeotechWallResult;
  allowableBearingKpa: number;
}> = ({ result, allowableBearingKpa }) => {
  const bars = [
    {
      label: 'Overturning Moment',
      demand: result.overturningMomentKnM * FOS_OVERTURNING_REQ,
      capacity: result.resistingMomentKnM,
      unit: 'kN·m',
      pass: result.overturningPass,
    },
    {
      label: 'Sliding Force',
      demand: result.totalHorizontalForceKnM * FOS_SLIDING_REQ,
      capacity: result.totalVerticalForceKnM * result.baseFrictionCoeff,
      unit: 'kN/m',
      pass: result.slidingPass,
    },
    {
      label: 'Peak Bearing q_max',
      demand: Number.isFinite(result.qMaxKpa) ? result.qMaxKpa : allowableBearingKpa * 2,
      capacity: allowableBearingKpa,
      unit: 'kPa',
      pass: result.bearingPass,
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Demand vs. Factored Capacity
        </span>
      </div>
      {bars.map((b) => {
        const maxVal = Math.max(b.demand, b.capacity, 1);
        const demPct = Math.min(100, (b.demand / maxVal) * 100);
        const capPct = Math.min(100, (b.capacity / maxVal) * 100);
        return (
          <div key={b.label} className="space-y-1">
            <div className="flex justify-between font-mono text-[10px]">
              <span className="font-sans font-semibold text-slate-700">{b.label}</span>
              <span className={b.pass ? 'text-emerald-700' : 'text-rose-700'}>
                {b.demand.toFixed(0)} / {b.capacity.toFixed(0)} {b.unit}
              </span>
            </div>
            <div className="relative h-3 w-full rounded bg-slate-200 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-slate-400/50"
                style={{ width: `${capPct}%` }}
              />
              <div
                className={`absolute inset-y-0.5 left-0 rounded-r ${
                  b.pass ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
                style={{ width: `${demPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

function drawGeotechWall(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tSec: number,
  params: GeotechWallParams,
  result: GeotechWallResult
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const H = params.wallHeightM;
  const B = params.baseWidthM;
  const geom = result.geometry;
  const pxPerM = Math.min((height * 0.56) / H, (width * 0.42) / B);
  const originX = width * 0.28; // Toe bottom-left corner
  const originY = height * 0.72;

  const toX = (xm: number) => originX + xm * pxPerM;
  const toY = (ym: number) => originY - ym * pxPerM;

  // Granular backfill polygon behind stem
  const backfillEndX = width - 24;
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(
    toX(geom.stemBackXM),
    toY(H),
    backfillEndX - toX(geom.stemBackXM),
    toY(geom.baseThicknessM) - toY(H)
  );
  // Also fill behind base slab edge
  ctx.fillRect(
    toX(B),
    toY(geom.baseThicknessM),
    backfillEndX - toX(B),
    originY - toY(geom.baseThicknessM)
  );

  // Saturated water zone below water table
  const hw = result.effectiveWaterHeightM;
  if (hw > 0.05) {
    const wtY = toY(hw);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.fillRect(
      toX(geom.stemBackXM),
      wtY,
      backfillEndX - toX(geom.stemBackXM),
      originY - wtY
    );

    // Animated seepage shimmer lines
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.28)';
    ctx.lineWidth = 1;
    const offset = (tSec * 22) % 36;
    for (let sy = wtY + 12; sy < originY - 6; sy += 16) {
      for (let sx = toX(geom.stemBackXM) + offset; sx < backfillEndX - 18; sx += 36) {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 14, sy);
        ctx.stroke();
      }
    }
  }

  // Draggable Groundwater Table Line
  const wtLineY = toY(hw);
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(toX(geom.stemBackXM), wtLineY);
  ctx.lineTo(backfillEndX, wtLineY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Water table inverted triangle symbol
  const triX = backfillEndX - 54;
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(triX - 7, wtLineY - 9);
  ctx.lineTo(triX + 7, wtLineY - 9);
  ctx.lineTo(triX, wtLineY);
  ctx.closePath();
  ctx.fill();
  ctx.font = '700 10px JetBrains Mono, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`GWT h_w=${hw.toFixed(1)}m (DRAG)`, backfillEndX - 66, wtLineY - 6);

  // Cantilever Concrete Retaining Wall Polygon
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(0));
  ctx.lineTo(toX(B), toY(0));
  ctx.lineTo(toX(B), toY(geom.baseThicknessM));
  ctx.lineTo(toX(geom.stemBackXM), toY(geom.baseThicknessM));
  ctx.lineTo(toX(geom.stemBackXM), toY(H));
  ctx.lineTo(toX(geom.stemBackXM - geom.stemTopThicknessM), toY(H));
  ctx.lineTo(toX(geom.toeLengthM), toY(geom.baseThicknessM));
  ctx.lineTo(toX(0), toY(geom.baseThicknessM));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draggable Traffic Surcharge Block
  const surX = toX(geom.stemBackXM + params.surchargeOffsetM + 1.0);
  const surTopY = toY(H);
  const blockH = Math.max(16, 14 + params.surchargeKpa * 0.8);
  ctx.fillStyle = params.surchargeKpa > 0 ? 'rgba(245, 158, 11, 0.85)' : 'rgba(148, 163, 184, 0.5)';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(surX - 38, surTopY - blockH, 76, blockH);
  ctx.strokeRect(surX - 38, surTopY - blockH, 76, blockH);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`q_s=${params.surchargeKpa} kPa`, surX, surTopY - blockH / 2 + 3);
  ctx.fillStyle = '#475569';
  ctx.fillText(`DRAG (d=${params.surchargeOffsetM.toFixed(1)}m)`, surX, surTopY - blockH - 6);

  // Lateral Earth + Hydrostatic Pressure Diagram drawn on stem back
  const maxLateralStressKpa =
    result.ka * params.soilUnitWeightKnM3 * H + 9.81 * hw + result.ka * params.surchargeKpa;
  const pressScalePx = Math.min(95, originX - 24) / Math.max(20, maxLateralStressKpa);
  const backX = toX(geom.stemBackXM);

  // Draw pressure polygon to the left of backX
  const dryTopStress = result.ka * params.surchargeKpa;
  const dryAtWtStress = dryTopStress + result.ka * params.soilUnitWeightKnM3 * (H - hw);
  const totalBaseStress =
    dryAtWtStress +
    result.ka * Math.max(1, params.soilUnitWeightKnM3 - 9.81) * hw +
    9.81 * hw;

  ctx.fillStyle = 'rgba(225, 29, 72, 0.16)';
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(backX, toY(H));
  ctx.lineTo(backX - dryTopStress * pressScalePx, toY(H));
  ctx.lineTo(backX - dryAtWtStress * pressScalePx, toY(hw));
  ctx.lineTo(backX - totalBaseStress * pressScalePx, toY(0));
  ctx.lineTo(backX, toY(0));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Horizontal Thrust Vector Arrow
  const thrustY = toY(H * 0.34);
  drawArrow(ctx, backX - 75, thrustY, backX - 4, thrustY, '#e11d48', `P_H=${result.totalHorizontalForceKnM.toFixed(0)} kN/m`);

  // Vertical Weight Vector Arrow
  const rx = toX(Math.max(0, Math.min(B, result.resultantXM)));
  drawArrow(ctx, rx, toY(H * 0.55), rx, toY(0.1), '#0f172a', `ΣV=${result.totalVerticalForceKnM.toFixed(0)}`);

  // Soil Bearing Pressure Trapezoid beneath Base Slab
  const qScale = 46 / Math.max(params.allowableBearingKpa, Number.isFinite(result.qMaxKpa) ? result.qMaxKpa : 400, 100);
  const qMaxPx = Math.min(68, (Number.isFinite(result.qMaxKpa) ? result.qMaxKpa : 400) * qScale);
  const qMinPx = Math.min(68, result.qMinKpa * qScale);
  const leftQPx = result.eccentricityM >= 0 ? qMaxPx : qMinPx;
  const rightQPx = result.eccentricityM >= 0 ? qMinPx : qMaxPx;

  ctx.fillStyle = result.bearingPass ? 'rgba(16, 185, 129, 0.25)' : 'rgba(225, 29, 72, 0.25)';
  ctx.strokeStyle = result.bearingPass ? '#059669' : '#e11d48';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(toX(0), originY);
  ctx.lineTo(toX(0), originY + leftQPx);
  ctx.lineTo(toX(B), originY + rightQPx);
  ctx.lineTo(toX(B), originY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Middle third markers on base slab
  const m1 = toX(B / 3);
  const m2 = toX((2 * B) / 3);
  ctx.strokeStyle = '#64748b';
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(m1, originY - 6);
  ctx.lineTo(m1, originY + 12);
  ctx.moveTo(m2, originY - 6);
  ctx.lineTo(m2, originY + 12);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 10px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `q_max = ${Number.isFinite(result.qMaxKpa) ? result.qMaxKpa.toFixed(1) : 'UPLIFT'} kPa | q_min = ${result.qMinKpa.toFixed(1)} kPa`,
    toX(0),
    originY + Math.max(leftQPx, rightQPx) + 16
  );

  // Dimension labels
  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.fillText(`B = ${B.toFixed(1)} m`, toX(B / 2), toY(0.15));
  ctx.textAlign = 'right';
  ctx.fillText(`H = ${H.toFixed(1)} m`, toX(0) - 10, toY(H / 2));
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  label: string
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  ctx.font = '700 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, (x1 + x2) / 2, Math.min(y1, y2) - 6);
}
