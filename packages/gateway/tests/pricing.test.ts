import { describe, expect, it } from "vitest";
import { costUsd, priceForModel } from "../src/pricing/pricing.js";

describe("request cost (codex-lb parity)", () => {
  it("resolves exact, dated and aliased models, and refuses unknown gpt-5.x", () => {
    expect(priceForModel("gpt-5.5")?.model).toBe("gpt-5.5");
    expect(priceForModel("GPT-5.5")?.model).toBe("gpt-5.5");
    expect(priceForModel("gpt-5.5-2026-04-01")?.model).toBe("gpt-5.5");
    expect(priceForModel("gpt-5.6")?.model).toBe("gpt-5.6-sol");
    expect(priceForModel("gpt-5.6-sol-xhigh")?.model).toBe("gpt-5.6-sol");
    expect(priceForModel("gpt-5.99-new")).toBeNull();
    expect(priceForModel(null)).toBeNull();
  });

  it("prices cached input separately and applies service tiers and long context", () => {
    // gpt-5.5: input 5, cached 0.5, output 30 per 1M.
    expect(costUsd({ inputTokens: 100_000, cachedInputTokens: 40_000, outputTokens: 10_000 }, "gpt-5.5", null)).toBeCloseTo(0.06 * 5 + 0.04 * 0.5 + 0.01 * 30);
    // priority: input 12.5, cached 1.25, output 75.
    expect(costUsd({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 }, "gpt-5.5", "priority")).toBeCloseTo(12.5);
    expect(costUsd({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 }, "gpt-5.5", "fast")).toBeCloseTo(12.5);
    // over 272k input tokens: long-context rates (10 / 1 / 45).
    expect(costUsd({ inputTokens: 300_000, cachedInputTokens: 0, outputTokens: 0 }, "gpt-5.5", null)).toBeCloseTo(0.3 * 10);
    // flex long context without a flex long rate falls back to doubled flex input.
    expect(costUsd({ inputTokens: 300_000, cachedInputTokens: 0, outputTokens: 0 }, "gpt-5.6-sol", "flex")).toBeCloseTo(0.3 * 4);
  });

  it("keeps unknown usage or prices unknown", () => {
    expect(costUsd(null, "gpt-5.5", null)).toBeNull();
    expect(costUsd({ inputTokens: null, cachedInputTokens: null, outputTokens: 5 }, "gpt-5.5", null)).toBeNull();
    expect(costUsd({ inputTokens: 5, cachedInputTokens: null, outputTokens: 5 }, "mystery-model", null)).toBeNull();
    expect(costUsd({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, "gpt-5.5", null)).toBe(0);
  });
});
