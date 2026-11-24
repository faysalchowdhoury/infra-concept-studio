import React from 'react';

export const MetricCell: React.FC<{
  label: string;
  value: string;
  sub?: string;
}> = ({ label, value, sub }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-2">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
    </div>
    <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
      {value}
    </div>
    {sub && (
      <div className="font-mono text-[10px] text-slate-500 tabular-nums">{sub}</div>
    )}
  </div>
);
