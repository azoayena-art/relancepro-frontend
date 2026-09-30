import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function KPICard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  gradient,
  trend,
}: {
  icon: any;
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  gradient: string;
  trend?: number;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/70 p-5 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200">
      {/* Subtle hover background */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.035] dark:group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none`}
      />

      <div className="relative flex items-start gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200`}
        >
          <Icon
            size={21}
            className="text-white"
            strokeWidth={2}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            {label}
          </p>

          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-tight">
            {value}
          </p>

          <div className="flex items-center gap-2 mt-1.5 min-w-0">
            {sublabel && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {sublabel}
              </p>
            )}

            {trend !== undefined && (
              <span
                className={`inline-flex flex-shrink-0 items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  trend > 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : trend < 0
                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {trend > 0 ? (
                  <TrendingUp size={10} strokeWidth={2} />
                ) : trend < 0 ? (
                  <TrendingDown size={10} strokeWidth={2} />
                ) : (
                  <Minus size={10} strokeWidth={2} />
                )}

                {Math.abs(trend)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}