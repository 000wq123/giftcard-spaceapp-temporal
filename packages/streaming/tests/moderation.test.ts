import { describe, expect, it } from "vitest";
import { decideStreamingModeration } from "../src/moderation.js";

describe("streaming moderation policy", () => {
  it("does not punish criticism, capitals, or an isolated swear", () => {
    for (const message of ["THIS STREAM IS BORING", "I disagree with the streamer", "damn, that was bad"]) {
      expect(decideStreamingModeration({ message, previousStrikes: 0, protectedAccount: false }).decision).toBe("ALLOW");
    }
  });
  it("uses warning, five minutes, then thirty minutes for repeated abuse", () => {
    expect([0, 1, 2].map(previousStrikes => decideStreamingModeration({ message: "abusive message", previousStrikes, protectedAccount: false, jevVerdict: "ABUSE" }).decision))
      .toEqual(["WARN", "TIMEOUT_5M", "TIMEOUT_30M"]);
  });
  it("applies the same escalation to clear targeted insults if Jev is unavailable", () => {
    expect([0, 1, 2].map(previousStrikes => decideStreamingModeration({ message: "You're an idiot", previousStrikes, protectedAccount: false }).decision))
      .toEqual(["WARN", "TIMEOUT_5M", "TIMEOUT_30M"]);
    expect(decideStreamingModeration({ message: "Είσαι ηλίθιος", previousStrikes: 0, protectedAccount: false }).decision).toBe("WARN");
    expect(decideStreamingModeration({ message: "You're an idiot", previousStrikes: 0, protectedAccount: false, jevVerdict: "SAFE" }).decision).toBe("ALLOW");
  });
  it("reserves uncertain cases for review and protects operator/moderator accounts", () => {
    expect(decideStreamingModeration({ message: "maybe abuse", previousStrikes: 0, protectedAccount: false, jevVerdict: "AMBIGUOUS" }).decision).toBe("REVIEW");
    expect(decideStreamingModeration({ message: "I will kill you", previousStrikes: 0, protectedAccount: true, jevVerdict: "SEVERE" }).decision).toBe("ALLOW");
  });
  it("applies a thirty minute timeout to explicit threats without Jev", () => {
    expect(decideStreamingModeration({ message: "I will kill you", previousStrikes: 0, protectedAccount: false })).toMatchObject({ decision: "TIMEOUT_30M", durationSeconds: 1800 });
  });
});
