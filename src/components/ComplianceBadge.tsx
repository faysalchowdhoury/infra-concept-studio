import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

interface ComplianceBadgeProps {
  title: string;
  pass: boolean;
  valueText: string;
  thresholdText: string;
  marginText: string;
}

export const ComplianceBadge: React.FC<ComplianceBadgeProps> = ({
  title,
  pass,
  valueText,
  thresholdText,
  marginText,
}) => {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        pass
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-rose-200 bg-rose-50/80'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          {title}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs font-bold ${
            pass
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {pass ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              PASS
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5" />
              FAIL
            </>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
        <span className="text-lg font-bold text-slate-900">{valueText}</span>
        <span className="text-xs text-slate-500">Req: {thresholdText}</span>
      </div>
      <div
        className={`mt-1 font-mono text-xs font-medium tabular-nums ${
          pass ? 'text-emerald-700' : 'text-rose-700'
        }`}
      >
        Margin: {marginText}
      </div>
    </div>
  );
};
