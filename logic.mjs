const ZERO = 0n;
const ONE = 1n;

export function gcdBig(a, b) {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || ONE;
}

export function gcdNumber(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function makeFraction(n, d = ONE) {
  const numerator = BigInt(n);
  const denominator = BigInt(d);
  if (denominator === ZERO) {
    throw new Error("Denominator cannot be zero.");
  }
  const sign = denominator < ZERO ? -ONE : ONE;
  const gcd = gcdBig(numerator, denominator);
  return {
    n: (numerator / gcd) * sign,
    d: (denominator / gcd) * sign,
  };
}

export function multiplyFraction(a, b) {
  return makeFraction(a.n * b.n, a.d * b.d);
}

export function divideFraction(a, b) {
  if (b.n === ZERO) {
    throw new Error("Cannot divide by zero.");
  }
  return makeFraction(a.n * b.d, a.d * b.n);
}

export function addFraction(a, b) {
  return makeFraction(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function fractionToNumber(fraction) {
  return Number(fraction.n) / Number(fraction.d);
}

export function formatFraction(fraction) {
  return fraction.d === ONE ? `${fraction.n}` : `${fraction.n}/${fraction.d}`;
}

export function formatDecimal(value, digits = 6) {
  if (!Number.isFinite(value)) return "-";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

export function parseNumberLike(raw) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  if (!value) {
    throw new Error("Enter a ratio.");
  }

  const mixed = value.match(/^([+-]?\d+)\+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = BigInt(mixed[1]);
    const numerator = BigInt(mixed[2]);
    const denominator = BigInt(mixed[3]);
    return addFraction(makeFraction(whole), makeFraction(numerator, denominator));
  }

  const fraction = value.match(/^([+-]?\d+)\/(\d+)$/);
  if (fraction) {
    return makeFraction(BigInt(fraction[1]), BigInt(fraction[2]));
  }

  const decimal = value.match(/^([+-]?\d+)(?:\.(\d+))?$/);
  if (decimal) {
    const whole = decimal[1];
    const decimals = decimal[2] ?? "";
    const denominator = 10n ** BigInt(decimals.length);
    const sign = whole.startsWith("-") ? -ONE : ONE;
    const wholeDigits = BigInt(whole);
    const decimalDigits = decimals ? BigInt(decimals) : ZERO;
    return makeFraction(wholeDigits * denominator + sign * decimalDigits, denominator);
  }

  throw new Error(`Could not read "${raw}" as a number or fraction.`);
}

export function parsePrice(raw, mode = "haveWant") {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/\s*(?:to|->|=>)\s*/i, ":");
  let price;

  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    if (parts.length !== 2) {
      throw new Error("Use one colon, like 1:1.19.");
    }
    const have = parseNumberLike(parts[0]);
    const want = parseNumberLike(parts[1]);
    price = divideFraction(want, have);
  } else {
    price = parseNumberLike(normalized);
  }

  if (price.n <= ZERO) {
    throw new Error("Ratio must be greater than zero.");
  }

  return mode === "havePerWant" ? divideFraction(makeFraction(ONE), price) : price;
}

export function applyNudge(price, basisPoints) {
  return multiplyFraction(price, makeFraction(10000 + Number(basisPoints), 10000));
}

export function ceilMul(fraction, amount) {
  const quantity = BigInt(amount);
  return Number((fraction.n * quantity + fraction.d - ONE) / fraction.d);
}

export function floorMul(fraction, amount) {
  const quantity = BigInt(amount);
  return Number((fraction.n * quantity) / fraction.d);
}

export function roundMul(fraction, amount) {
  const quantity = BigInt(amount);
  return Number((fraction.n * quantity * 2n + fraction.d) / (fraction.d * 2n));
}

export function wantForHave(price, have, rounding) {
  if (rounding === "atMost") return floorMul(price, have);
  if (rounding === "nearest") return Math.max(1, roundMul(price, have));
  return ceilMul(price, have);
}

export function orderRate(order) {
  return order.want / order.have;
}

export function relativeError(order, price) {
  return orderRate(order) / fractionToNumber(price) - 1;
}

export function atomicOrder(have, want) {
  const divisor = gcdNumber(have, want);
  return {
    have: have / divisor,
    want: want / divisor,
  };
}

export function exactUnit(price) {
  return {
    have: Number(price.d),
    want: Number(price.n),
  };
}

export function riskForAtom(atomHave, priceNumber) {
  const fraction = priceNumber - Math.floor(priceNumber);
  const justOverInteger = priceNumber > 1 && fraction > 0 && fraction < 0.12;

  if (atomHave > 60 || (atomHave > 30 && justOverInteger)) {
    return {
      level: "high",
      label: "High",
      reason: justOverInteger
        ? "High denominator and just over an integer."
        : "High denominator.",
    };
  }

  if (atomHave > 20 || justOverInteger) {
    return {
      level: "medium",
      label: "Medium",
      reason: justOverInteger ? "Just over an integer." : "Moderate denominator.",
    };
  }

  return {
    level: "low",
    label: "Low",
    reason: "Small atomic unit.",
  };
}

export function makeCandidate(price, have, rounding) {
  const want = wantForHave(price, have, rounding);
  if (want <= 0) return null;
  const atom = atomicOrder(have, want);
  return {
    have: atom.have,
    want: atom.want,
    sourceHave: have,
    sourceWant: want,
    error: relativeError(atom, price),
    rate: orderRate(atom),
  };
}

export function generateCandidates(price, options = {}) {
  const maxAtomic = Math.max(2, Math.floor(options.maxAtomic ?? 30));
  const rounding = options.rounding ?? "atLeast";
  const maxDrift = Number(options.maxDrift ?? 0.01);
  const seen = new Map();

  for (let have = 1; have <= maxAtomic; have += 1) {
    const candidate = makeCandidate(price, have, rounding);
    if (!candidate) continue;
    if (candidate.have > maxAtomic) continue;
    if (Math.abs(candidate.error) > maxDrift) continue;

    const key = `${candidate.have}:${candidate.want}`;
    const previous = seen.get(key);
    if (!previous || Math.abs(candidate.error) < Math.abs(previous.error)) {
      seen.set(key, candidate);
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const byError = Math.abs(a.error) - Math.abs(b.error);
    if (Math.abs(byError) > 0.0000001) return byError;
    return a.have - b.have;
  });
}

function compressRows(rows) {
  const byPair = new Map();
  for (const row of rows) {
    const key = `${row.have}:${row.want}`;
    byPair.set(key, {
      have: row.have,
      want: row.want,
      repeat: (byPair.get(key)?.repeat ?? 0) + 1,
    });
  }
  return Array.from(byPair.values()).sort((a, b) => {
    if (a.have !== b.have) return a.have - b.have;
    return a.want - b.want;
  });
}

export function buildPlan(candidate, totalHave, slots, price, options = {}) {
  const rounding = options.rounding ?? "atLeast";
  const maxLeftoverDrift = Number(options.maxLeftoverDrift ?? 0.05);
  const total = Math.max(1, Math.floor(totalHave));
  const slotLimit = Math.max(1, Math.floor(slots));
  const atomCount = Math.floor(total / candidate.have);
  const rows = [];

  if (atomCount > 0) {
    const mainSlots = Math.min(slotLimit, atomCount);
    const base = Math.floor(atomCount / mainSlots);
    const extra = atomCount % mainSlots;

    for (let index = 0; index < mainSlots; index += 1) {
      const atomsInRow = base + (index < extra ? 1 : 0);
      rows.push({
        have: candidate.have * atomsInRow,
        want: candidate.want * atomsInRow,
      });
    }
  }

  const mainHave = atomCount * candidate.have;
  const mainWant = atomCount * candidate.want;
  const leftoverHave = total - mainHave;
  const hasSlotForLeftover = rows.length < slotLimit;
  let leftover = null;

  if (leftoverHave > 0 && hasSlotForLeftover) {
    const leftoverWant = wantForHave(price, leftoverHave, rounding);
    const leftoverError = leftoverWant / leftoverHave / fractionToNumber(price) - 1;
    leftover = {
      have: leftoverHave,
      want: leftoverWant,
      error: leftoverError,
      usable: Math.abs(leftoverError) <= maxLeftoverDrift,
    };
  }

  const risk = riskForAtom(candidate.have, fractionToNumber(price));
  const rowCount = compressRows(rows).reduce((sum, row) => sum + row.repeat, 0);
  const score =
    Math.abs(candidate.error) * 180 +
    candidate.have / 35 +
    (leftoverHave / total) * 2 +
    Math.max(0, rowCount - slotLimit) * 5;

  return {
    atom: {
      have: candidate.have,
      want: candidate.want,
    },
    rows: compressRows(rows),
    leftover,
    totals: {
      have: mainHave,
      want: mainWant,
      listedHave: mainHave + (leftover?.usable ? leftover.have : 0),
      listedWant: mainWant + (leftover?.usable ? leftover.want : 0),
    },
    error: candidate.error,
    rate: candidate.rate,
    risk,
    score,
  };
}

export function exactPlan(price, totalHave, slots, rounding = "atLeast") {
  const unit = exactUnit(price);
  const candidate = {
    have: unit.have,
    want: unit.want,
    error: 0,
    rate: orderRate(unit),
  };
  return buildPlan(candidate, totalHave, slots, price, { rounding });
}

export function sellAllPlan(price, totalHave, slots, rounding = "atLeast") {
  const total = Math.max(1, Math.floor(totalHave));
  const candidates = [];

  for (let have = 1; have <= total; have += 1) {
    if (total % have !== 0) continue;
    const candidate = makeCandidate(price, have, rounding);
    if (!candidate) continue;
    const plan = buildPlan(candidate, total, slots, price, { rounding });
    if (plan.totals.have === total) {
      candidates.push(plan);
    }
  }

  return candidates.sort((a, b) => {
    const byError = Math.abs(a.error) - Math.abs(b.error);
    if (Math.abs(byError) > 0.0000001) return byError;
    return a.atom.have - b.atom.have;
  })[0];
}

export function shieldPlan(plan) {
  if (!plan || plan.totals.have <= plan.atom.have) return null;

  const remainingHave = plan.totals.have - plan.atom.have;
  const remainingWant = plan.totals.want - plan.atom.want;
  return {
    ...plan,
    rows: [
      {
        have: plan.atom.have,
        want: plan.atom.want,
        repeat: 1,
      },
      {
        have: remainingHave,
        want: remainingWant,
        repeat: 1,
      },
    ],
    shielded: true,
  };
}

export function simulatePartialFill(orderHave, orderWant, fillHave, fillWant) {
  const have = Math.max(0, Math.floor(orderHave));
  const want = Math.max(0, Math.floor(orderWant));
  const usedHave = Math.max(0, Math.floor(fillHave));
  const usedWant = Math.max(0, Math.floor(fillWant));

  if (have <= 0 || want <= 0 || usedHave <= 0 || usedWant <= 0) {
    throw new Error("All simulator values must be positive whole numbers.");
  }

  if (usedHave >= have || usedWant >= want) {
    return {
      complete: true,
      originalRate: want / have,
      fillRate: usedWant / usedHave,
      remainingRate: null,
      sameRatio: true,
    };
  }

  const remainingHave = have - usedHave;
  const remainingWant = want - usedWant;
  const sameRatio = BigInt(want) * BigInt(remainingHave) === BigInt(have) * BigInt(remainingWant);

  return {
    complete: false,
    originalRate: want / have,
    fillRate: usedWant / usedHave,
    remainingHave,
    remainingWant,
    remainingRate: remainingWant / remainingHave,
    sameRatio,
  };
}
