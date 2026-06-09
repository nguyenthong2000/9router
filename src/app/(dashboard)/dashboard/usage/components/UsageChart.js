"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Card from "@/shared/components/Card";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

// Distinct-ish palette cycled across account lines.
const ACCOUNT_COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4",
  "#8b5cf6", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
  "#3b82f6", "#a855f7", "#eab308", "#22c55e", "#e11d48",
];

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [rateData, setRateData] = useState({ buckets: [], accounts: [], truncated: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("tokens");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === "rate") {
        const res = await fetch(`/api/usage/chart?period=${period}&breakdown=account`);
        if (res.ok) {
          const json = await res.json();
          setRateData({
            buckets: Array.isArray(json?.buckets) ? json.buckets : [],
            accounts: Array.isArray(json?.accounts) ? json.accounts : [],
            truncated: json?.truncated || 0,
          });
        }
      } else {
        const res = await fetch(`/api/usage/chart?period=${period}`);
        if (res.ok) {
          const json = await res.json();
          setData(Array.isArray(json) ? json : []);
        }
      }
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period, viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData =
    viewMode === "rate"
      ? rateData.accounts.length > 0
      : data.some((d) => d.tokens > 0 || d.cost > 0);

  const renderModeButton = (mode, label) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${viewMode === mode ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
    >
      {label}
    </button>
  );

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="grid w-full grid-cols-3 items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 sm:w-auto sm:self-start">
        {renderModeButton("tokens", "Tokens")}
        {renderModeButton("cost", "Cost")}
        {renderModeButton("rate", "Success rate")}
      </div>

      {viewMode === "rate" && rateData.truncated > 0 && (
        <p className="text-xs text-text-muted">
          Showing top {rateData.accounts.length} accounts by volume ({rateData.truncated} more hidden).
        </p>
      )}

      {loading ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">Loading...</div>
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data for this period</div>
      ) : viewMode === "rate" ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rateData.buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [`${value}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {rateData.accounts.map((acc, i) => (
              <Line
                key={acc.id}
                type="monotone"
                dataKey={`rate_${acc.id}`}
                name={acc.name}
                stroke={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={viewMode === "tokens" ? fmtTokens : fmtCost}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) =>
                name === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Cost"]
              }
            />
            {viewMode === "tokens" ? (
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradTokens)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradCost)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
