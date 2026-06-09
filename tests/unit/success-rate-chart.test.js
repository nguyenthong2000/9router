// getChartData success-rate buckets — verifies requests/failures land in the
// right time bucket for both the hourly (today) and daily (7d) branches.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-ratechart-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("getChartData — success-rate buckets", () => {
  it("today (hourly): counts requests + failures per bucket, empty buckets are 0", async () => {
    // 2 success + 1 fail, all "now" → same hour bucket
    await db.saveRequestUsage({ provider: "kiro", model: "m", connectionId: "c1", tokens: { prompt_tokens: 3, completion_tokens: 2 }, status: "ok" });
    await db.saveRequestUsage({ provider: "kiro", model: "m", connectionId: "c1", tokens: { prompt_tokens: 1, completion_tokens: 1 }, status: "ok" });
    await db.saveRequestUsage({ provider: "kiro", model: "m", connectionId: "c1", tokens: {}, status: "error", errorCode: 503 });

    const chart = await db.getChartData("today");
    expect(chart).toHaveLength(24);

    const totRequests = chart.reduce((s, b) => s + (b.requests || 0), 0);
    const totFailures = chart.reduce((s, b) => s + (b.failures || 0), 0);
    expect(totRequests).toBe(3);
    expect(totFailures).toBe(1);

    // Every bucket exposes the fields (default 0), so the UI can compute 100% for empties.
    for (const b of chart) {
      expect(b).toHaveProperty("requests");
      expect(b).toHaveProperty("failures");
    }
  });

  it("7d (daily): today's bucket carries requests + failures", async () => {
    const chart = await db.getChartData("7d");
    expect(chart).toHaveLength(7);
    const last = chart[chart.length - 1]; // today
    expect(last.requests).toBe(3);
    expect(last.failures).toBe(1);
  });
});

describe("getSuccessRateChartData — per-account lines", () => {
  it("today: one series per account that made calls; rate uses success/total", async () => {
    // c1 already has 2 ok + 1 fail from the earlier block (66% rate).
    // Add c2 with 1 ok only (100%).
    await db.saveRequestUsage({ provider: "kiro", model: "m", connectionId: "c2", tokens: { prompt_tokens: 2, completion_tokens: 1 }, status: "ok" });

    const { buckets, accounts } = await db.getSuccessRateChartData("today");
    expect(buckets).toHaveLength(24);

    const ids = accounts.map((a) => a.id).sort();
    expect(ids).toEqual(["c1", "c2"]);

    // Find the "now" bucket (the only one with data) by checking c1 != 100.
    const active = buckets.find((b) => b.rate_c1 !== 100);
    expect(active.rate_c1).toBe(67); // round(2/3*100)
    expect(active.rate_c2).toBe(100);

    // Empty buckets default to 100% for every account (no downtime).
    const empty = buckets.find((b) => b.rate_c1 === 100);
    expect(empty.rate_c1).toBe(100);
    expect(empty.rate_c2).toBe(100);
  });

  it("7d daily: per-account rate comes from usageDaily.byAccount", async () => {
    const { buckets, accounts } = await db.getSuccessRateChartData("7d");
    expect(buckets).toHaveLength(7);
    expect(accounts.map((a) => a.id).sort()).toEqual(["c1", "c2"]);
    const today = buckets[buckets.length - 1];
    expect(today.rate_c1).toBe(67);
    expect(today.rate_c2).toBe(100);
  });
});
