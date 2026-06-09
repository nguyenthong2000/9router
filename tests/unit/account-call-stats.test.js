// Per-account success/fail call stats — verifies saveRequestUsage records both
// successful and failed calls, and getUsageStats rolls them up per connectionId.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-callstats-"));
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

describe("Account call stats — success/fail tracking", () => {
  it("counts a success (status ok) and a fail (status error) per connectionId", async () => {
    const connId = "conn-A";

    // 2 successes with tokens
    await db.saveRequestUsage({ provider: "kiro", model: "claude-opus", connectionId: connId, tokens: { prompt_tokens: 10, completion_tokens: 5 }, status: "ok" });
    await db.saveRequestUsage({ provider: "kiro", model: "claude-opus", connectionId: connId, tokens: { prompt_tokens: 8, completion_tokens: 4 }, status: "ok" });
    // 1 failure, no tokens
    await db.saveRequestUsage({ provider: "kiro", model: "claude-opus", connectionId: connId, tokens: {}, status: "error", errorCode: 503 });

    const stats = await db.getUsageStats("today");
    const c = stats.byConnection[connId];

    expect(c).toBeTruthy();
    expect(c.requests).toBe(3);
    expect(c.failures).toBe(1);
    // success = requests - failures
    expect(c.requests - c.failures).toBe(2);
    // tokens only from successful calls (failures had {})
    expect(c.promptTokens).toBe(18);
    expect(c.completionTokens).toBe(9);
  });

  it("treats 2xx numeric status as success, non-2xx as failure", async () => {
    const connId = "conn-B";
    await db.saveRequestUsage({ provider: "codex", model: "gpt", connectionId: connId, tokens: { prompt_tokens: 1 }, status: "200 OK" });
    await db.saveRequestUsage({ provider: "codex", model: "gpt", connectionId: connId, tokens: {}, status: 429 });

    const stats = await db.getUsageStats("today");
    const c = stats.byConnection[connId];
    expect(c.requests).toBe(2);
    expect(c.failures).toBe(1);
  });

  it("keeps separate connections isolated", async () => {
    const stats = await db.getUsageStats("today");
    expect(stats.byConnection["conn-A"].requests).toBe(3);
    expect(stats.byConnection["conn-B"].requests).toBe(2);
  });
});
