import React from 'react';

interface ParameterSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  precision?: number;
  onChange: (value: number) => void;
  hint?: string;
}

export const ParameterSlider: React.FC<ParameterSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 0,
  onChange,
  hint,
}) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-slate-700">{label}</label>
        <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
          {value.toFixed(precision)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-900"
      />
      <div className="flex justify-between font-mono text-[10px] text-slate-400 tabular-nums">
        <span>
          {min.toFixed(precision)} {unit}
        </span>
        {hint && <span className="font-sans text-[10px] text-slate-500">{hint}</span>}
        <span>
          {max.toFixed(precision)} {unit}
        </span>
      </div>
    </div>
  );
};
