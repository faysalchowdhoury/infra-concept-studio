import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import {
  EvGridParams,
  EvGridResult,
  SUBSTATION_MILEPOST_MI,
  WORST_CASE_EV_GRID_PARAMS,
  solveEvGrid,
} from '../physics/evGridSolver';
import { ParameterSlider } from '../components/ParameterSlider';
import { ComplianceBadge } from '../components/ComplianceBadge';
import { MetricCell } from '../components/MetricCell';
import { getCanvasPointerPos, syncCanvasDpr } from '../components/canvasUtils';

interface EvGridModuleProps {
  params: EvGridParams;
  onChange: (next: EvGridParams) => void;
}

interface SimVehicle {
  id: number;
  xNorm: number; // 0 to 1 across 50-mile corridor
  laneOffset: number; // -1 or +1
  speed: number;
  isEv: boolean;
  charging: boolean;
  chargeProgress: number;
}

export const EvGridModule: React.FC<EvGridModuleProps> = ({ params, onChange }) => {
  const result: EvGridResult = useMemo(() => solveEvGrid(params), [params]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const [isHoveringStation, setIsHoveringStation] = useState(false);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const resultRef = useRef(result);
  resultRef.current = result;

  // Deterministic initial fleet of highway vehicles for 60fps animation
  const fleetRef = useRef<SimVehicle[]>(
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      xNorm: (i * 0.037) % 1,
      laneOffset: i % 2 === 0 ? -1 : 1,
      speed: 0.06 + (i % 5) * 0.008,
      isEv: i % 3 === 0,
      charging: false,
      chargeProgress: (i * 0.17) % 1,
    }))
  );

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const canvas = canvasRef.current;
      if (canvas) {
        const { width, height, ctx } = syncCanvasDpr(canvas);
        if (ctx) {
          drawEvCorridor(
            ctx,
            width,
            height,
            now / 1000,
            dt,
            paramsRef.current,
            resultRef.current,
            fleetRef.current
          );
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const updateStationFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x } = getCanvasPointerPos(canvas, clientX, clientY);
    const width = canvas.getBoundingClientRect().width;
    const padX = 56;
    const trackW = Math.max(100, width - padX * 2);
    const ratio = Math.max(0.01, Math.min(0.99, (x - padX) / trackW));
    const milepost = Math.round(ratio * 50 * 2) / 2;
    const feederDistanceMi = Math.max(
      0.5,
      Math.min(25, Math.abs(milepost - SUBSTATION_MILEPOST_MI))
    );
    onChange({
      ...params,
      stationMilepostMi: milepost,
      feederDistanceMi,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    const padX = 56;
    const trackW = Math.max(100, rect.width - padX * 2);
    const stationX = padX + (params.stationMilepostMi / 50) * trackW;
    const stationY = rect.height * 0.42;

    if (Math.hypot(x - stationX, y - stationY) <= 44 || Math.abs(x - stationX) <= 36) {
      draggingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      updateStationFromPointer(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (draggingRef.current) {
      updateStationFromPointer(e.clientX, e.clientY);
      return;
    }
    const { x, y } = getCanvasPointerPos(canvas, e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    const padX = 56;
    const trackW = Math.max(100, rect.width - padX * 2);
    const stationX = padX + (params.stationMilepostMi / 50) * trackW;
    const stationY = rect.height * 0.42;
    setIsHoveringStation(Math.hypot(x - stationX, y - stationY) <= 44);
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
            <h2 className="text-sm font-bold text-slate-900">Corridor & Feeder Inputs</h2>
            <p className="text-[11px] text-slate-500">M/M/c Erlang-C & 12.47 kV Drop</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...WORST_CASE_EV_GRID_PARAMS })}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            Worst-Case Sweep
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <ParameterSlider
            label="EV Penetration"
            value={params.evPenetrationPct}
            min={5}
            max={60}
            step={1}
            unit="%"
            onChange={(v) => onChange({ ...params, evPenetrationPct: v })}
          />
          <ParameterSlider
            label="Charger Ports (c)"
            value={params.chargerPorts}
            min={4}
            max={32}
            step={1}
            unit="ports"
            onChange={(v) => onChange({ ...params, chargerPorts: v })}
          />

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-700">Charger Power</span>
              <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                {params.chargerPowerKw} kW
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([150, 250, 350] as const).map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => onChange({ ...params, chargerPowerKw: kw })}
                  className={`rounded-md border py-1.5 font-mono text-xs font-semibold transition-colors ${
                    params.chargerPowerKw === kw
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {kw} kW
                </button>
              ))}
            </div>
          </div>

          <ParameterSlider
            label="Peak Hourly Traffic"
            value={params.peakTrafficVph}
            min={500}
            max={4000}
            step={50}
            unit="vph"
            onChange={(v) => onChange({ ...params, peakTrafficVph: v })}
          />
          <ParameterSlider
            label="Transformer Rating"
            value={params.transformerKva}
            min={1000}
            max={5000}
            step={100}
            unit="kVA"
            onChange={(v) => onChange({ ...params, transformerKva: v })}
          />
          <ParameterSlider
            label="Grid Marginal Emissions"
            value={params.emissionsFactorGCo2Kwh}
            min={150}
            max={750}
            step={10}
            unit="g/kWh"
            onChange={(v) => onChange({ ...params, emissionsFactorGCo2Kwh: v })}
          />
          <ParameterSlider
            label="Feeder Substation Distance"
            value={params.feederDistanceMi}
            min={0.5}
            max={25.0}
            step={0.5}
            precision={1}
            unit="mi"
            hint="Synced w/ drag"
            onChange={(dist) => {
              const side = params.stationMilepostMi >= SUBSTATION_MILEPOST_MI ? 1 : -1;
              onChange({
                ...params,
                feederDistanceMi: dist,
                stationMilepostMi: SUBSTATION_MILEPOST_MI + side * dist,
              });
            }}
          />
        </div>
      </aside>

      {/* Center Stage (Flexible) */}
      <section className="flex-1 min-h-[380px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-slate-900" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              50-Mile Highway Corridor & DCFC Plaza Simulation
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            Drag DCFC Station horizontally (Mile {params.stationMilepostMi.toFixed(1)})
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
              setIsHoveringStation(false);
            }}
            className={`h-full w-full touch-none ${
              isHoveringStation || draggingRef.current ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
          />
        </div>
      </section>

      {/* Right Panel (340px) */}
      <aside className="w-full lg:w-[340px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Compliance Screening
          </h3>
          <div className="mt-2 space-y-2.5">
            <ComplianceBadge
              title="Transformer Capacity"
              pass={result.transformerPass}
              valueText={`${result.transformerLoadingPct.toFixed(1)}%`}
              thresholdText="≤ 100.0%"
              marginText={`${result.transformerMarginPct >= 0 ? '+' : ''}${result.transformerMarginPct.toFixed(1)}%`}
            />
            <ComplianceBadge
              title="Erlang-C Mean Wait (Wq)"
              pass={result.waitTimePass}
              valueText={
                result.isQueueUnstable
                  ? 'UNSTABLE (ρ≥1)'
                  : `${result.meanWaitTimeMin.toFixed(2)} min`
              }
              thresholdText="≤ 10.0 min"
              marginText={
                result.isQueueUnstable
                  ? 'Over-saturated'
                  : `${result.waitTimeMarginMin >= 0 ? '+' : ''}${result.waitTimeMarginMin.toFixed(2)} min`
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="Arrival Demand λ"
            value={`${result.arrivalRateVehHr.toFixed(1)} EV/hr`}
            sub={`ρ = ${(result.utilizationRho * 100).toFixed(0)}%`}
          />
          <MetricCell
            label="Coincident Load"
            value={`${result.coincidentLoadKw.toFixed(0)} kW`}
            sub={`DF ${(result.diversityFactor * 100).toFixed(0)}%`}
          />
          <MetricCell
            label="Feeder ΔV Drop"
            value={`${result.feederVoltageDropPct.toFixed(2)}%`}
            sub={`${params.feederDistanceMi.toFixed(1)} mi @ 12.47 kV`}
          />
          <MetricCell
            label="Peak CO₂ Rate"
            value={`${result.hourlyCo2Kg.toFixed(0)} kg/h`}
            sub={`${result.dailyCo2Tons.toFixed(2)} t/day`}
          />
        </div>

        <EvProfileChart result={result} transformerKva={params.transformerKva} />
      </aside>
    </div>
  );
};

const EvProfileChart: React.FC<{ result: EvGridResult; transformerKva: number }> = ({
  result,
  transformerKva,
}) => {
  const w = 300;
  const h = 165;
  const padL = 36;
  const padR = 34;
  const padT = 18;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxLoad = Math.max(
    transformerKva * 1.1,
    ...result.profile24h.map((d) => d.loadKw),
    500
  );
  const maxCo2 = Math.max(...result.profile24h.map((d) => d.co2Kg), 100);

  const loadPoints = result.profile24h
    .map((d, i) => {
      const x = padL + (i / 23) * plotW;
      const y = padT + plotH - (d.loadKw / maxLoad) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const limitY = padT + plotH - ((transformerKva * 0.98) / maxLoad) * plotH;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          24-Hr Load & CO₂ Profile
        </span>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1 text-slate-900">
            <span className="h-2 w-2 rounded-full bg-slate-900" /> kW
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/70" /> CO₂
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
        {/* Horizontal grid */}
        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padL}
                y1={y}
                x2={w - padR}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[8px]"
              >
                {Math.round(maxLoad * frac)}
              </text>
            </g>
          );
        })}

        {/* CO2 bars */}
        {result.profile24h.map((d, i) => {
          const barW = plotW / 24 - 1.5;
          const x = padL + (i / 24) * plotW + 0.75;
          const barH = (d.co2Kg / maxCo2) * plotH;
          return (
            <rect
              key={d.hour}
              x={x}
              y={padT + plotH - barH}
              width={Math.max(2, barW)}
              height={barH}
              fill="rgba(16, 185, 129, 0.35)"
              rx={1}
            />
          );
        })}

        {/* Transformer rating line */}
        <line
          x1={padL}
          y1={limitY}
          x2={w - padR}
          y2={limitY}
          stroke="#e11d48"
          strokeWidth={1.2}
          strokeDasharray="4 3"
        />
        <text
          x={w - padR}
          y={Math.max(padT + 8, limitY - 3)}
          textAnchor="end"
          className="fill-rose-600 font-mono text-[8px] font-semibold"
        >
          Xfmr Cap
        </text>

        {/* Load polyline */}
        <polyline
          fill="none"
          stroke="#0f172a"
          strokeWidth={2}
          strokeLinejoin="round"
          points={loadPoints}
        />

        {/* X axis labels */}
        {[0, 6, 12, 18, 23].map((hr) => {
          const x = padL + (hr / 23) * plotW;
          return (
            <text
              key={hr}
              x={x}
              y={h - 6}
              textAnchor="middle"
              className="fill-slate-500 font-mono text-[8px]"
            >
              {hr.toString().padStart(2, '0')}h
            </text>
          );
        })}

        {/* Right Y axis max CO2 */}
        <text
          x={w - padR + 3}
          y={padT + 4}
          textAnchor="start"
          className="fill-emerald-700 font-mono text-[8px]"
        >
          {Math.round(maxCo2)}kg
        </text>
      </svg>
    </div>
  );
};

function drawEvCorridor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tSec: number,
  dt: number,
  params: EvGridParams,
  result: EvGridResult,
  fleet: SimVehicle[]
) {
  ctx.clearRect(0, 0, width, height);

  // Blueprint grid background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < width; gx += 32) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = 0; gy < height; gy += 32) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  const padX = 56;
  const trackW = Math.max(100, width - padX * 2);
  const highwayY = height * 0.68;
  const stationX = padX + (params.stationMilepostMi / 50) * trackW;
  const stationY = height * 0.40;
  const substationX = padX + (SUBSTATION_MILEPOST_MI / 50) * trackW;
  const substationY = height * 0.16;

  // MV Distribution Feeder Line from Substation to DCFC Station
  ctx.save();
  ctx.strokeStyle = result.transformerPass ? '#0f172a' : '#e11d48';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(substationX, substationY + 20);
  ctx.lineTo(substationX, (substationY + stationY) * 0.52);
  ctx.lineTo(stationX, (substationY + stationY) * 0.52);
  ctx.lineTo(stationX, stationY - 26);
  ctx.stroke();

  // Animated power-flow particles along feeder
  const flowSpeed = 0.6 + Math.min(2.0, result.coincidentLoadKw / 1500);
  const particleCount = 6;
  const pathPts = [
    { x: substationX, y: substationY + 20 },
    { x: substationX, y: (substationY + stationY) * 0.52 },
    { x: stationX, y: (substationY + stationY) * 0.52 },
    { x: stationX, y: stationY - 26 },
  ];
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < pathPts.length - 1; i++) {
    const l = Math.hypot(pathPts[i + 1].x - pathPts[i].x, pathPts[i + 1].y - pathPts[i].y);
    segLens.push(l);
    totalLen += l;
  }
  if (totalLen > 1) {
    for (let p = 0; p < particleCount; p++) {
      const dist = (((tSec * flowSpeed * 90 + (p * totalLen) / particleCount) % totalLen) + totalLen) % totalLen;
      let acc = 0;
      for (let s = 0; s < segLens.length; s++) {
        if (dist <= acc + segLens[s] || s === segLens.length - 1) {
          const frac = segLens[s] > 0 ? (dist - acc) / segLens[s] : 0;
          const px = pathPts[s].x + (pathPts[s + 1].x - pathPts[s].x) * frac;
          const py = pathPts[s].y + (pathPts[s + 1].y - pathPts[s].y) * frac;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        acc += segLens[s];
      }
    }
  }
  ctx.restore();

  // Feeder Distance Callout
  const midFeederX = (substationX + stationX) / 2;
  const midFeederY = (substationY + stationY) * 0.52 - 8;
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 11px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `12.47 kV Feeder: ${params.feederDistanceMi.toFixed(1)} mi | ΔV = ${result.feederVoltageDropPct.toFixed(2)}%`,
    midFeederX,
    midFeederY
  );

  // Substation Card at Mile 25
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  roundRect(ctx, substationX - 72, substationY - 20, 144, 40, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUBSTATION (MI 25.0)', substationX, substationY - 2);
  ctx.font = '600 10px JetBrains Mono, monospace';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Rating: ${params.transformerKva} kVA`, substationX, substationY + 12);

  // Highway Corridor (0 - 50 mi)
  ctx.fillStyle = '#1e293b';
  roundRect(ctx, padX - 16, highwayY - 24, trackW + 32, 48, 6);
  ctx.fill();

  // Center dashed lane divider
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(padX - 8, highwayY);
  ctx.lineTo(padX + trackW + 8, highwayY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Milepost ticks
  ctx.fillStyle = '#475569';
  ctx.font = '600 10px JetBrains Mono, monospace';
  for (let m = 0; m <= 50; m += 10) {
    const mx = padX + (m / 50) * trackW;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, highwayY + 26);
    ctx.lineTo(mx, highwayY + 32);
    ctx.stroke();
    ctx.fillText(`MI ${m}`, mx, highwayY + 44);
  }

  // Off-ramp connector from highway to DCFC station
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(stationX - 28, highwayY - 20);
  ctx.quadraticCurveTo(stationX - 14, stationY + 38, stationX, stationY + 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(stationX + 28, highwayY - 20);
  ctx.quadraticCurveTo(stationX + 14, stationY + 38, stationX, stationY + 26);
  ctx.stroke();

  // Update & draw moving vehicles on highway
  const evShare = params.evPenetrationPct / 100;
  const speedScale = 0.6 + (params.peakTrafficVph / 4000) * 0.7;
  fleet.forEach((v, idx) => {
    const dir = v.laneOffset < 0 ? 1 : -1;
    v.xNorm = (v.xNorm + dir * v.speed * speedScale * dt + 1) % 1;
    const vx = padX + v.xNorm * trackW;
    const vy = highwayY + v.laneOffset * 11;
    const isEv = (idx / fleet.length) < evShare;
    ctx.fillStyle = isEv ? '#10b981' : '#94a3b8';
    ctx.fillRect(vx - 6, vy - 3.5, 12, 7);
    if (isEv) {
      ctx.fillStyle = '#ecfdf5';
      ctx.fillRect(vx - 2, vy - 1.5, 4, 3);
    }
  });

  // Draggable DCFC Station Card
  const cardW = 186;
  const cardH = 74;
  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = result.overallPass ? '#0f172a' : '#e11d48';
  ctx.lineWidth = 2.5;
  roundRect(ctx, stationX - cardW / 2, stationY - cardH / 2, cardW, cardH, 8);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = result.overallPass ? '#0f172a' : '#e11d48';
  ctx.lineWidth = 2.5;
  roundRect(ctx, stationX - cardW / 2, stationY - cardH / 2, cardW, cardH, 8);
  ctx.stroke();

  // Drag grip dots
  ctx.fillStyle = '#94a3b8';
  for (let gx = -8; gx <= 8; gx += 8) {
    ctx.beginPath();
    ctx.arc(stationX + gx, stationY - cardH / 2 + 8, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`DCFC PLAZA (MI ${params.stationMilepostMi.toFixed(1)})`, stationX, stationY - 12);

  // Port utilization bar cells inside DCFC Plaza
  const ports = params.chargerPorts;
  const activePorts = Math.round(result.expectedActivePorts);
  const cols = Math.min(16, ports);
  const cellW = Math.min(9, (cardW - 28) / cols - 1.5);
  const startPx = stationX - (cols * (cellW + 1.5)) / 2;
  for (let p = 0; p < ports; p++) {
    const row = Math.floor(p / 16);
    const col = p % 16;
    const cx = startPx + col * (cellW + 1.5);
    const cy = stationY - 2 + row * 10;
    const occupied = p < activePorts;
    ctx.fillStyle = occupied
      ? result.transformerPass
        ? '#10b981'
        : '#f43f5e'
      : '#e2e8f0';
    ctx.fillRect(cx, cy, cellW, 7);
  }

  // Queue holding indicator
  const queuedCount = result.isQueueUnstable
    ? 8
    : Math.min(8, Math.round(result.erlangCProbWait * 6));
  if (queuedCount > 0) {
    ctx.fillStyle = result.waitTimePass ? '#f59e0b' : '#e11d48';
    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillText(
      result.isQueueUnstable
        ? 'QUEUE SATURATED (ρ ≥ 1.0)'
        : `Queue: ${result.meanWaitTimeMin.toFixed(1)} min avg`,
      stationX,
      stationY + 28
    );
  } else {
    ctx.fillStyle = '#059669';
    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillText(`Active: ${result.expectedActivePorts.toFixed(1)}/${ports} ports`, stationX, stationY + 28);
  }

  // Legend bottom left
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 10px JetBrains Mono, monospace';
  ctx.fillText(
    `Load: ${result.coincidentLoadKw.toFixed(0)} kW (${result.transformerLoadingPct.toFixed(1)}% Xfmr) | ${result.hourlyCo2Kg.toFixed(0)} kg CO₂/hr`,
    16,
    height - 14
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
