import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Construction } from 'lucide-react';
import {
  CORRIDOR_LENGTH_M,
  WORST_CASE_WORK_ZONE_PARAMS,
  WorkZoneParams,
  WorkZoneResult,
  solveWorkZone,
} from '../physics/workZoneSolver';
import { ParameterSlider } from '../components/ParameterSlider';
import { ComplianceBadge } from '../components/ComplianceBadge';
import { MetricCell } from '../components/MetricCell';
import { getCanvasPointerPos, syncCanvasDpr } from '../components/canvasUtils';

interface WorkZoneModuleProps {
  params: WorkZoneParams;
  onChange: (next: WorkZoneParams) => void;
}

interface StreamCar {
  xM: number; // 0 to 400
  lane: number; // 0, 1, 2
  isHeavy: boolean;
}

export const WorkZoneModule: React.FC<WorkZoneModuleProps> = ({ params, onChange }) => {
  const result: WorkZoneResult = useMemo(() => solveWorkZone(params), [params]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const [hoverBarrier, setHoverBarrier] = useState(false);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const resultRef = useRef(result);
  resultRef.current = result;

  const streamRef = useRef<StreamCar[]>(
    Array.from({ length: 30 }, (_, i) => ({
      xM: (i * 13.5) % CORRIDOR_LENGTH_M,
      lane: i % 3,
      isHeavy: i % 5 === 0,
    }))
  );

  useEffect(() => {
    let rafId = 0;
    let last = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const canvas = canvasRef.current;
      if (canvas) {
        const { width, height, ctx } = syncCanvasDpr(canvas);
        if (ctx) {
          drawWorkZoneCorridor(
            ctx,
            width,
            height,
            now / 1000,
            dt,
            paramsRef.current,
            resultRef.current,
            streamRef.current
          );
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const updateBarrierFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x } = getCanvasPointerPos(canvas, clientX, clientY);
    const width = canvas.getBoundingClientRect().width;
    const padX = 58;
    const roadW = Math.max(120, width - padX * 2);
    const ratio = Math.max(0.1, Math.min(0.8, (x - padX) / roadW));
    const meters = Math.round((ratio * CORRIDOR_LENGTH_M) / 5) * 5;
    onChange({
      ...params,
      workZoneStartM: Math.max(40, Math.min(320, meters)),
    });
  };

  const getBarrierX = (width: number) => {
    const padX = 58;
    const roadW = Math.max(120, width - padX * 2);
    return padX + (params.workZoneStartM / CORRIDOR_LENGTH_M) * roadW;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const bx = getBarrierX(canvas.getBoundingClientRect().width);
    if (Math.abs(x - bx) <= 36) {
      draggingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      updateBarrierFromPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (draggingRef.current) {
      updateBarrierFromPointer(e.clientX, e.clientY);
      return;
    }
    const { x } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const bx = getBarrierX(canvas.getBoundingClientRect().width);
    setHoverBarrier(Math.abs(x - bx) <= 32);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) {
      draggingRef.current = false;
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-3">
      {/* Left Panel (320px) */}
      <aside className="w-full lg:w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Arterial & Signal Inputs</h2>
            <p className="text-[11px] text-slate-500">HCM 7th Ed. Work-Zone Delay</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...WORST_CASE_WORK_ZONE_PARAMS })}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            Worst-Case Sweep
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <ParameterSlider
            label="Approach Volume"
            value={params.approachVolumeVph}
            min={400}
            max={2200}
            step={25}
            unit="vph"
            onChange={(v) => onChange({ ...params, approachVolumeVph: v })}
          />
          <ParameterSlider
            label="Heavy Vehicle %"
            value={params.heavyVehiclePct}
            min={0}
            max={35}
            step={1}
            unit="%"
            onChange={(v) => onChange({ ...params, heavyVehiclePct: v })}
          />

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-700">Lane Drop Configuration</span>
              <span className="font-mono text-xs font-semibold text-slate-900">
                {params.baseLanes} → {params.baseLanes - 1} lanes
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([2, 3] as const).map((lanes) => (
                <button
                  key={lanes}
                  type="button"
                  onClick={() => onChange({ ...params, baseLanes: lanes })}
                  className={`rounded-md border py-1.5 font-mono text-xs font-semibold transition-colors ${
                    params.baseLanes === lanes
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {lanes} → {lanes - 1} Lanes
                </button>
              ))}
            </div>
          </div>

          <ParameterSlider
            label="Signal Cycle Length (C)"
            value={params.cycleLengthS}
            min={60}
            max={150}
            step={5}
            unit="s"
            onChange={(v) => onChange({ ...params, cycleLengthS: v })}
          />
          <ParameterSlider
            label="Effective Green Ratio (g/C)"
            value={params.effectiveGreenRatio}
            min={0.30}
            max={0.65}
            step={0.01}
            precision={2}
            unit=""
            onChange={(v) => onChange({ ...params, effectiveGreenRatio: v })}
          />
          <ParameterSlider
            label="Work-Zone Barrier Position"
            value={params.workZoneStartM}
            min={40}
            max={320}
            step={5}
            unit="m"
            hint="Synced w/ drag"
            onChange={(v) => onChange({ ...params, workZoneStartM: v })}
          />
        </div>
      </aside>

      {/* Center Stage (Flexible) */}
      <section className="flex-1 min-h-[380px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Construction className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              400 m Signalized Arterial (Intersection A → Work Zone → Intersection B)
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            Drag barrier ({params.workZoneStartM} m from A)
          </span>
        </div>

        <div className="relative flex-1 min-h-[320px] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              draggingRef.current = false;
              setHoverBarrier(false);
            }}
            className={`h-full w-full touch-none ${
              hoverBarrier || draggingRef.current ? 'cursor-ew-resize' : 'cursor-default'
            }`}
          />
        </div>
      </section>

      {/* Right Panel (340px) */}
      <aside className="w-full lg:w-[340px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            HCM 7th Ed. Compliance
          </h3>
          <div className="mt-2 space-y-2.5">
            <ComplianceBadge
              title="Intersection LOS & Delay"
              pass={result.losPass}
              valueText={`LOS ${result.losGrade} (${result.controlDelayS.toFixed(1)} s)`}
              thresholdText="≤ LOS D (55.0 s)"
              marginText={`${result.delayMarginS >= 0 ? '+' : ''}${result.delayMarginS.toFixed(1)} s/veh`}
            />
            <ComplianceBadge
              title="Queue Spillback Check"
              pass={result.spillbackPass}
              valueText={`${result.queueLengthM.toFixed(0)} m queue`}
              thresholdText={`≤ ${result.availableStorageM.toFixed(0)} m storage`}
              marginText={`${result.storageMarginM >= 0 ? '+' : ''}${result.storageMarginM.toFixed(0)} m`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="v/c Ratio"
            value={result.vcRatio.toFixed(2)}
            sub={`Cap: ${result.capacityVph.toFixed(0)} vph`}
          />
          <MetricCell
            label="HV Factor (f_HV)"
            value={result.heavyVehicleFactor.toFixed(3)}
            sub={`f_wz = ${result.workZoneReductionFactor.toFixed(2)}`}
          />
          <MetricCell
            label="Uniform Delay d₁"
            value={`${result.uniformDelayS.toFixed(1)} s`}
            sub={`d₂ = ${result.incrementalDelayS.toFixed(1)} s`}
          />
          <MetricCell
            label="Queue / Lane"
            value={`${result.queueVehiclesPerLane.toFixed(1)} veh`}
            sub={`L_veh = ${result.avgVehicleSpacingM.toFixed(1)} m`}
          />
        </div>

        <TimeSpaceChart params={params} result={result} />
      </aside>
    </div>
  );
};

const TimeSpaceChart: React.FC<{ params: WorkZoneParams; result: WorkZoneResult }> = ({
  params,
  result,
}) => {
  const w = 300;
  const h = 175;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxTime = params.cycleLengthS * 2;
  const greenS = params.cycleLengthS * params.effectiveGreenRatio;

  const wzY = padT + plotH - (params.workZoneStartM / CORRIDOR_LENGTH_M) * plotH;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Time-Space Progression Diagram
        </span>
        <span className="font-mono text-[10px] text-slate-500">0–400 m</span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
        {/* Distance axis ticks */}
        {[0, 200, 400].map((dist) => {
          const y = padT + plotH - (dist / CORRIDOR_LENGTH_M) * plotH;
          return (
            <g key={dist}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[8px]"
              >
                {dist}m
              </text>
            </g>
          );
        })}

        {/* Work zone horizontal band */}
        <line
          x1={padL}
          y1={wzY}
          x2={w - padR}
          y2={wzY}
          stroke="#f59e0b"
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />

        {/* Signal phase bars at Upstream A (bottom) and Downstream B (top) */}
        {[0, 1].map((c) => {
          const tStart = c * params.cycleLengthS;
          const xGreenStart = padL + (tStart / maxTime) * plotW;
          const xGreenEnd = padL + ((tStart + greenS) / maxTime) * plotW;
          const xRedEnd = padL + (((c + 1) * params.cycleLengthS) / maxTime) * plotW;
          return (
            <g key={c}>
              {/* Intersection A */}
              <line
                x1={xGreenStart}
                y1={padT + plotH}
                x2={xGreenEnd}
                y2={padT + plotH}
                stroke="#10b981"
                strokeWidth={4}
              />
              <line
                x1={xGreenEnd}
                y1={padT + plotH}
                x2={xRedEnd}
                y2={padT + plotH}
                stroke="#e11d48"
                strokeWidth={4}
              />
              {/* Intersection B */}
              <line
                x1={xGreenStart}
                y1={padT}
                x2={xGreenEnd}
                y2={padT}
                stroke="#10b981"
                strokeWidth={4}
              />
              <line
                x1={xGreenEnd}
                y1={padT}
                x2={xRedEnd}
                y2={padT}
                stroke="#e11d48"
                strokeWidth={4}
              />
            </g>
          );
        })}

        {/* Platoon progression trajectories */}
        {result.timeSpaceWaves.slice(0, 2).map((wave) => {
          const x0 = padL + (wave.departureTimeS / maxTime) * plotW;
          const xWz = padL + (Math.min(maxTime, wave.arrivalAtBarrierS) / maxTime) * plotW;
          const xB = padL + (Math.min(maxTime, wave.arrivalAtIntersectionBS) / maxTime) * plotW;
          const y0 = padT + plotH;
          const yB = padT;
          return (
            <polyline
              key={wave.cycleIndex}
              fill="none"
              stroke="#0f172a"
              strokeWidth={1.8}
              points={`${x0.toFixed(1)},${y0.toFixed(1)} ${xWz.toFixed(1)},${wzY.toFixed(1)} ${xB.toFixed(1)},${yB.toFixed(1)}`}
            />
          );
        })}

        <text x={padL} y={h - 6} className="fill-slate-400 font-mono text-[8px]">
          0s
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end" className="fill-slate-400 font-mono text-[8px]">
          {maxTime}s (2 Cycles)
        </text>
      </svg>
    </div>
  );
};

function drawWorkZoneCorridor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tSec: number,
  dt: number,
  params: WorkZoneParams,
  result: WorkZoneResult,
  stream: StreamCar[]
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const padX = 58;
  const roadW = Math.max(120, width - padX * 2);
  const roadCy = height * 0.50;
  const laneH = 26;
  const totalRoadH = params.baseLanes * laneH;
  const roadTop = roadCy - totalRoadH / 2;

  const wzLengthM = 55;
  const barrierX = padX + (params.workZoneStartM / CORRIDOR_LENGTH_M) * roadW;
  const wzEndX = padX + (Math.min(CORRIDOR_LENGTH_M - 15, params.workZoneStartM + wzLengthM) / CORRIDOR_LENGTH_M) * roadW;

  // Distance ruler ticks
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  for (let m = 0; m <= 400; m += 100) {
    const tx = padX + (m / CORRIDOR_LENGTH_M) * roadW;
    ctx.beginPath();
    ctx.moveTo(tx, roadTop - 22);
    ctx.lineTo(tx, roadTop - 14);
    ctx.stroke();
    ctx.fillText(`${m}m`, tx, roadTop - 28);
  }

  // Road deck
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(padX, roadTop, roadW, totalRoadH);

  // Lane markings
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([10, 8]);
  for (let l = 1; l < params.baseLanes; l++) {
    const ly = roadTop + l * laneH;
    ctx.beginPath();
    ctx.moveTo(padX, ly);
    ctx.lineTo(padX + roadW, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Red queue back-propagation bars extending upstream from barrierX
  const queuePx = (Math.min(params.workZoneStartM + 40, result.queueLengthM) / CORRIDOR_LENGTH_M) * roadW;
  const qStartX = Math.max(padX - 18, barrierX - queuePx);
  ctx.fillStyle = result.spillbackIntoUpstreamA
    ? 'rgba(225, 29, 72, 0.42)'
    : 'rgba(244, 63, 94, 0.25)';
  ctx.fillRect(qStartX, roadTop + 2, barrierX - qStartX, totalRoadH - 4);

  if (result.spillbackIntoUpstreamA) {
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2;
    ctx.strokeRect(qStartX, roadTop + 2, barrierX - qStartX, totalRoadH - 4);
    ctx.fillStyle = '#e11d48';
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillText('SPILLBACK INTO INTERSECTION A!', padX + 125, roadTop + totalRoadH + 28);
  }

  // Work-zone closed top lane + merge taper
  const closedY = roadTop;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.beginPath();
  ctx.moveTo(barrierX - 28, closedY);
  ctx.lineTo(wzEndX, closedY);
  ctx.lineTo(wzEndX, closedY + laneH);
  ctx.lineTo(barrierX, closedY + laneH);
  ctx.closePath();
  ctx.fill();

  // Animated vehicles compressing through taper
  const hvFraction = params.heavyVehiclePct / 100;
  const cyclePos = (tSec % 8) / 8;
  const isGreen = cyclePos < params.effectiveGreenRatio;

  stream.forEach((car, idx) => {
    const activeLane = car.lane % params.baseLanes;
    const isHeavy = (idx / stream.length) < hvFraction;
    const speedFactor = isGreen ? 48 : car.xM > params.workZoneStartM - 20 ? 42 : 16;
    car.xM = (car.xM + speedFactor * dt) % CORRIDOR_LENGTH_M;

    const cx = padX + (car.xM / CORRIDOR_LENGTH_M) * roadW;
    // Compress lane 0 into lane 1 through the work zone
    let visualLane = activeLane;
    if (
      activeLane === 0 &&
      car.xM >= params.workZoneStartM - 24 &&
      car.xM <= params.workZoneStartM + wzLengthM
    ) {
      visualLane = 1;
    }
    const cy = roadTop + visualLane * laneH + laneH / 2;
    const len = isHeavy ? 18 : 11;
    ctx.fillStyle = isHeavy ? '#f59e0b' : '#38bdf8';
    ctx.fillRect(cx - len / 2, cy - 5, len, 10);
  });

  // Draggable Work-Zone Barrier Handle
  ctx.fillStyle = '#f97316';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.fillRect(barrierX - 5, roadTop - 6, 10, laneH + 12);
  ctx.strokeRect(barrierX - 5, roadTop - 6, 10, laneH + 12);

  // Diagonal work-zone cones along closed lane
  ctx.fillStyle = '#fb923c';
  for (let cx = barrierX + 12; cx <= wzEndX; cx += 18) {
    ctx.beginPath();
    ctx.arc(cx, closedY + laneH * 0.55, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drag pill label above barrier
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(barrierX - 42, roadTop - 28, 84, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`DRAG (${params.workZoneStartM}m)`, barrierX, roadTop - 16);

  // Intersection A (0m) & Intersection B (400m) Signal Posts
  const drawSignal = (sx: number, label: string) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx - 8, roadTop - 8, 16, totalRoadH + 16);
    ctx.fillStyle = isGreen ? '#10b981' : '#e11d48';
    ctx.beginPath();
    ctx.arc(sx, roadTop + totalRoadH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillText(label, sx, roadTop + totalRoadH + 26);
  };
  drawSignal(padX, 'INT. A (0m)');
  drawSignal(padX + roadW, 'INT. B (400m)');

  // Queue callout bottom-left
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 10px JetBrains Mono, monospace';
  ctx.fillText(
    `Queue Back-of-Queue: ${result.queueLengthM.toFixed(1)} m / ${result.availableStorageM.toFixed(0)} m storage | LOS ${result.losGrade} (${result.controlDelayS.toFixed(1)} s/veh)`,
    14,
    height - 12
  );
}
