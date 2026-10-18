import { expect, it } from "vitest";
import { classifyLoad } from "../src/nous/server-load.js";
import { overloadReasons } from "../../../scripts/space-load-gate.mjs";

const GiB = 1024 ** 3;

it("holds agents' heavy commands back exactly when Nous's load state is OVERLOADED", () => {
  for (const cpuPercent of [null, 50, 89.9, 90, 99])
    for (const load5 of [10, 29.9, 30, 40])
      for (const memAvailableBytes of [null, 2 * GiB, 3.99 * GiB, 4 * GiB, 20 * GiB])
        for (const swapPercent of [null, 30, 59.9, 60, 80]) {
          const input = { cpuPercent, load5, cores: 20, memAvailableBytes, swapPercent };
          const nous = classifyLoad(input);
          expect(overloadReasons(input), JSON.stringify(input)).toEqual(nous.level === "OVERLOADED" ? nous.reasons : []);
        }
});
