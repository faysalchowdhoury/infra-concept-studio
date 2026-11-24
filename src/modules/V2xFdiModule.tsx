import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  AttackType,
  V2xFdiParams,
  V2xFdiResult,
  WORST_CASE_V2X_PARAMS,
  solveV2xFdi,
} from '../physics/v2xFdiSolver';
import { ParameterSlider } from '../components/ParameterSlider';
import { ComplianceBadge } from '../components/ComplianceBadge';
import { MetricCell } from '../components/MetricCell';
import { getCanvasPointerPos, syncCanvasDpr } from '../components/canvasUtils';

interface V2xFdiModuleProps {
  params: V2xFdiParams;
  onChange: (next: V2xFdiParams) => void;
}

const ATTACK_SEQUENCE: AttackType[] = [
  'none',
  'pos_spoof',
  'unphysical_accel',
  'ghost_vehicle',
];

const ATTACK_LABELS: Record<AttackType, string> = {
  none: 'Benign',
  pos_spoof: 'Position Spoof +15m',
  unphysical_accel: 'Unphysical Jerk/Accel',
  ghost_vehicle: 'Ghost Vehicle Injection',
};

interface ResidualSample {
  peak: number;
  benign: number;
  threshold: number;
}

export const V2xFdiModule: React.FC<V2xFdiModuleProps> = ({ params, onChange }) => {
  const result: V2xFdiResult = useMemo(() => solveV2xFdi(params), [params]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('V04');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [history, setHistory] = useState<ResidualSample[]>(() =>
    Array.from({ length: 40 }, () => ({
      peak: result.peakResidual,
      benign: result.benignMaxResidual,
      threshold: params.residualThreshold,
    }))
  );

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const resultRef = useRef(result);
  resultRef.current = result;
  const selectedRef = useRef(selectedVehicleId);
  selectedRef.current = selectedVehicleId;

  // Record live residual trace samples at 6 Hz for smooth time-series visualization
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = resultRef.current;
      const p = paramsRef.current;
      setHistory((prev) => [
        ...prev.slice(-39),
        {
          peak: r.peakResidual,
          benign: r.benignMaxResidual,
          threshold: p.residualThreshold,
        },
      ]);
    }, 180);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let rafId = 0;
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const { width, height, ctx } = syncCanvasDpr(canvas);
        if (ctx) {
          drawIntersection(
            ctx,
            width,
            height,
            now / 1000,
            paramsRef.current,
            resultRef.current,
            selectedRef.current
          );
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const hitTestVehicle = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { x, y } = getCanvasPointerPos(canvas, clientX, clientY);
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const scale = Math.min(rect.width, rect.height) / 145;

    let closestId: string | null = null;
    let bestDist = 24;
    for (const v of result.vehicles) {
      const vx = cx + v.truePos.x * scale;
      const vy = cy + v.truePos.y * scale;
      const d = Math.hypot(x - vx, y - vy);
      if (d < bestDist) {
        bestDist = d;
        closestId = v.id;
      }
    }
    return closestId;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hitId = hitTestVehicle(e.clientX, e.clientY);
    if (!hitId) return;
    setSelectedVehicleId(hitId);
    const current = params.vehicleAttacks[hitId] ?? 'none';
    const nextIdx = (ATTACK_SEQUENCE.indexOf(current) + 1) % ATTACK_SEQUENCE.length;
    onChange({
      ...params,
      vehicleAttacks: {
        ...params.vehicleAttacks,
        [hitId]: ATTACK_SEQUENCE[nextIdx],
      },
    });
  };

  const frictionLabel =
    params.roadFrictionMu < 0.35
      ? 'Icy Surface'
      : params.roadFrictionMu < 0.6
        ? 'Wet Pavement'
        : 'Dry Asphalt';

  const selectedVehicle =
    result.vehicles.find((v) => v.id === selectedVehicleId) ?? result.vehicles[0];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row gap-3">
      {/* Left Panel (320px) */}
      <aside className="w-full lg:w-[320px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">V2X BSM & Envelope Inputs</h2>
            <p className="text-[11px] text-slate-500">SAE J2735 Kinematic Filter</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...WORST_CASE_V2X_PARAMS })}
            className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            Worst-Case Sweep
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <ParameterSlider
            label="Road Friction (μ)"
            value={params.roadFrictionMu}
            min={0.25}
            max={0.85}
            step={0.05}
            precision={2}
            unit="μ"
            hint={frictionLabel}
            onChange={(v) => onChange({ ...params, roadFrictionMu: v })}
          />
          <ParameterSlider
            label="BSM Broadcast Rate"
            value={params.bsmRateHz}
            min={1}
            max={10}
            step={1}
            unit="Hz"
            onChange={(v) => onChange({ ...params, bsmRateHz: v })}
          />
          <ParameterSlider
            label="Kinematic Residual Threshold"
            value={params.residualThreshold}
            min={0.5}
            max={5.0}
            step={0.1}
            precision={1}
            unit="σ"
            onChange={(v) => onChange({ ...params, residualThreshold: v })}
          />
          <ParameterSlider
            label="Attack Magnitude"
            value={params.attackMagnitude}
            min={0.5}
            max={2.0}
            step={0.1}
            precision={1}
            unit="×"
            onChange={(v) => onChange({ ...params, attackMagnitude: v })}
          />

          {/* Selected vehicle attack quick selector */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Selected Node: {selectedVehicle.id} ({selectedVehicle.leg})
              </span>
              <span className="font-mono text-[11px] font-semibold text-slate-900">
                R = {selectedVehicle.residualScore.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ATTACK_SEQUENCE.map((atk) => (
                <button
                  key={atk}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...params,
                      vehicleAttacks: {
                        ...params.vehicleAttacks,
                        [selectedVehicle.id]: atk,
                      },
                    })
                  }
                  className={`rounded border px-2 py-1 text-left text-[10px] font-semibold transition-colors ${
                    selectedVehicle.attackType === atk
                      ? atk === 'none'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-rose-600 bg-rose-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {ATTACK_LABELS[atk]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Center Stage (Flexible) */}
      <section className="flex-1 min-h-[380px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {result.protectedPass ? (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              4-Leg Signalized Intersection — 12 Connected Vehicles (BSM Stream)
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            Click any vehicle to cycle FDI attack
          </span>
        </div>

        <div className="relative flex-1 min-h-[320px] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onPointerMove={(e) => setHoveredId(hitTestVehicle(e.clientX, e.clientY))}
            onPointerLeave={() => setHoveredId(null)}
            className={`h-full w-full ${hoveredId ? 'cursor-pointer' : 'cursor-default'}`}
          />
        </div>
      </section>

      {/* Right Panel (340px) */}
      <aside className="w-full lg:w-[340px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-y-auto space-y-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Cyber-Physical Protection Status
          </h3>
          <div className="mt-2">
            <ComplianceBadge
              title={
                result.activeAttackCount > 0
                  ? 'Protected (FDI Quarantine)'
                  : 'Protected (Nominal Standby)'
              }
              pass={result.protectedPass}
              valueText={
                result.activeAttackCount === 0
                  ? '0 False Pos.'
                  : result.missedDetections > 0
                    ? 'MISSED ATTACK'
                    : `${result.maxDetectionLatencyMs.toFixed(1)} ms`
              }
              thresholdText="< 50.0 ms & 0 FP"
              marginText={
                result.falsePositives > 0
                  ? `${result.falsePositives} False Positive(s)`
                  : result.missedDetections > 0
                    ? `${result.missedDetections} Unquarantined`
                    : `${result.latencyMarginMs >= 0 ? '+' : ''}${result.latencyMarginMs.toFixed(1)} ms`
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCell
            label="Lat Bound (μg)"
            value={`${result.maxLatAccelBoundMs2.toFixed(2)} m/s²`}
            sub={`Long: ${result.maxLongAccelBoundMs2.toFixed(2)} m/s²`}
          />
          <MetricCell
            label="Active Attacks"
            value={`${result.activeAttackCount} / 12`}
            sub={`Quarantined: ${result.quarantinedCount}`}
          />
          <MetricCell
            label="Peak Residual"
            value={`${result.peakResidual.toFixed(2)} σ`}
            sub={`Benign max: ${result.benignMaxResidual.toFixed(2)} σ`}
          />
          <MetricCell
            label="False Positives"
            value={`${result.falsePositives}`}
            sub={`Missed: ${result.missedDetections}`}
          />
        </div>

        <ResidualTimeSeriesChart history={history} threshold={params.residualThreshold} />
      </aside>
    </div>
  );
};

const ResidualTimeSeriesChart: React.FC<{
  history: ResidualSample[];
  threshold: number;
}> = ({ history, threshold }) => {
  const w = 300;
  const h = 155;
  const padL = 32;
  const padR = 12;
  const padT = 16;
  const padB = 22;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxY = Math.max(
    6,
    threshold * 1.3,
    ...history.map((s) => s.peak)
  );

  const toPoints = (getter: (s: ResidualSample) => number) =>
    history
      .map((s, i) => {
        const x = padL + (i / Math.max(1, history.length - 1)) * plotW;
        const y = padT + plotH - (Math.min(maxY, getter(s)) / maxY) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const threshY = padT + plotH - (threshold / maxY) * plotH;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
          Kinematic Residual Spike Trace
        </span>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-rose-600">Peak</span>
          <span className="text-slate-600">Benign</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
        {[0, 0.5, 1].map((f) => {
          const y = padT + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 font-mono text-[8px]"
              >
                {(maxY * f).toFixed(1)}
              </text>
            </g>
          );
        })}

        <line
          x1={padL}
          y1={threshY}
          x2={w - padR}
          y2={threshY}
          stroke="#0f172a"
          strokeWidth={1.2}
          strokeDasharray="4 3"
        />
        <text
          x={w - padR}
          y={Math.max(padT + 8, threshY - 3)}
          textAnchor="end"
          className="fill-slate-900 font-mono text-[8px] font-bold"
        >
          Thresh {threshold.toFixed(1)}σ
        </text>

        <polyline
          fill="none"
          stroke="#64748b"
          strokeWidth={1.5}
          points={toPoints((s) => s.benign)}
        />
        <polyline
          fill="none"
          stroke="#e11d48"
          strokeWidth={2}
          points={toPoints((s) => s.peak)}
        />

        <text x={padL} y={h - 6} className="fill-slate-400 font-mono text-[8px]">
          -7s
        </text>
        <text x={w - padR} y={h - 6} textAnchor="end" className="fill-slate-400 font-mono text-[8px]">
          LIVE
        </text>
      </svg>
    </div>
  );
};

function drawIntersection(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tSec: number,
  params: V2xFdiParams,
  result: V2xFdiResult,
  selectedId: string
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) / 145;
  const roadHalfW = 11 * scale;

  // Asphalt 4-leg intersection
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(cx - roadHalfW, 0, roadHalfW * 2, height);
  ctx.fillRect(0, cy - roadHalfW, width, roadHalfW * 2);

  // Lane markings
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, cy - roadHalfW);
  ctx.moveTo(cx, cy + roadHalfW);
  ctx.lineTo(cx, height);
  ctx.moveTo(0, cy);
  ctx.lineTo(cx - roadHalfW, cy);
  ctx.moveTo(cx + roadHalfW, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();

  // RSU antenna & radar scan pulse at intersection center
  const pulseR = ((tSec * params.bsmRateHz * 14) % 90) + 12;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '700 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('RSU', cx, cy + 14);

  // Draw vehicles, kinematic friction envelopes, and spoofed BSM ghosts
  for (const v of result.vehicles) {
    const vx = cx + v.truePos.x * scale;
    const vy = cy + v.truePos.y * scale;
    const rx = cx + v.reportedPos.x * scale;
    const ry = cy + v.reportedPos.y * scale;
    const isSelected = v.id === selectedId;

    // Kinematic envelope circle proportional to mu * g
    const envRadius = Math.max(10, result.maxLatAccelBoundMs2 * 1.9);
    ctx.strokeStyle = v.quarantined
      ? 'rgba(225, 29, 72, 0.35)'
      : isSelected
        ? 'rgba(15, 23, 42, 0.35)'
        : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(vx, vy, envRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spoofed BSM ghost bounding box if reported position differs
    if (v.positionErrorM > 0.5) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(rx, ry);
      ctx.stroke();

      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate((v.headingDeg * Math.PI) / 180);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.fillRect(-10, -5.5, 20, 11);
      ctx.strokeRect(-10, -5.5, 20, 11);
      ctx.restore();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 9px JetBrains Mono, monospace';
      ctx.fillText('SPOOF BSM', rx, ry - 11);
    }

    // True vehicle body
    ctx.save();
    ctx.translate(vx, vy);
    ctx.rotate((v.headingDeg * Math.PI) / 180);
    ctx.fillStyle = v.quarantined
      ? '#e11d48'
      : v.isAttacked
        ? '#f59e0b'
        : '#38bdf8';
    ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
    ctx.lineWidth = isSelected ? 2.5 : 1.2;
    ctx.fillRect(-10, -5.5, 20, 11);
    ctx.strokeRect(-10, -5.5, 20, 11);
    ctx.restore();

    // Label + Quarantine pill
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(v.id, vx, vy + 16);

    if (v.quarantined) {
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(vx - 26, vy - 22, 52, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 8px JetBrains Mono, monospace';
      ctx.fillText('QUARANTINE', vx, vy - 13);
    }
  }

  // Legend overlay
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 10px JetBrains Mono, monospace';
  ctx.fillText(
    `Envelope: |a_lat| ≤ ${result.maxLatAccelBoundMs2.toFixed(2)} m/s² | BSM: ${params.bsmRateHz} Hz | Threshold: ${params.residualThreshold.toFixed(1)}σ`,
    14,
    height - 12
  );
}
