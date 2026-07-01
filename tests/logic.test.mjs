import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlan,
  exactUnit,
  generateCandidates,
  parsePrice,
  sellAllPlan,
  simulatePartialFill,
} from "../logic.mjs";

test("parses have:want decimal ratios", () => {
  const price = parsePrice("1:1.19", "haveWant");
  assert.equal(price.n, 119n);
  assert.equal(price.d, 100n);
  assert.deepEqual(exactUnit(price), { have: 100, want: 119 });
});

test("parses text ratios people type from trade listings", () => {
  const price = parsePrice("1.2 to 1", "haveWant");
  assert.equal(price.n, 5n);
  assert.equal(price.d, 6n);
});

test("parses mixed fractions used in trade explanations", () => {
  const price = parsePrice("16 + 12/143", "wantPerHave");
  assert.equal(price.n, 2300n);
  assert.equal(price.d, 143n);
});

test("finds a low-drift chunk for 108 at 1:1.19", () => {
  const price = parsePrice("1:1.19", "haveWant");
  const candidates = generateCandidates(price, {
    maxAtomic: 30,
    maxDrift: 0.01,
    rounding: "atLeast",
  });
  const best = candidates[0];
  assert.deepEqual({ have: best.have, want: best.want }, { have: 21, want: 25 });

  const plan = buildPlan(best, 108, 10, price, { rounding: "atLeast" });
  assert.equal(plan.totals.have, 105);
  assert.equal(plan.leftover.have, 3);
});

test("sell-all plan covers the full visible quantity", () => {
  const price = parsePrice("1:1.19", "haveWant");
  const plan = sellAllPlan(price, 108, 10, "atLeast");
  assert.equal(plan.totals.have, 108);
  assert.deepEqual(plan.atom, { have: 36, want: 43 });
});

test("partial-fill simulator flags ratio-changing remainder", () => {
  const result = simulatePartialFill(100, 119, 6, 8);
  assert.equal(result.sameRatio, false);
  assert.equal(result.remainingHave, 94);
  assert.equal(result.remainingWant, 111);
});
