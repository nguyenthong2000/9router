"use client";

/**
 * Compact success/fail/rate strip shown under an account's quota in
 * ProviderLimits. Receives the aggregated counters for one connectionId.
 *
 * @param {{ requests?: number, failures?: number }} stats
 */
export default function AccountCallStats({ stats }) {
  const requests = stats?.requests || 0;
  const failures = stats?.failures || 0;
  const success = Math.max(0, requests - failures);

  // No calls in the period → show a neutral placeholder instead of 0/0.
  if (requests === 0) {
    return (
      <div className="flex items-center gap-2 px-1 pt-1.5 text-[10px] text-text-muted">
        <span className="material-symbols-outlined text-[12px] opacity-40">
          insights
        </span>
        <span>No calls in last 7d</span>
      </div>
    );
  }

  const rate = Math.round((success / requests) * 100);
  const rateColor =
    rate >= 95
      ? "text-emerald-600 dark:text-emerald-400"
      : rate >= 80
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const barColor =
    rate >= 95 ? "bg-emerald-500" : rate >= 80 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="px-1 pt-1.5 space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            <span className="font-medium tabular-nums">{success}</span>
          </span>
          <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
            <span className="material-symbols-outlined text-[12px]">cancel</span>
            <span className="font-medium tabular-nums">{failures}</span>
          </span>
        </div>
        <span className={`font-semibold tabular-nums ${rateColor}`}>{rate}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
        <div className={`h-full ${barColor}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}
