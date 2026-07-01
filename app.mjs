import {
  applyNudge,
  buildPlan,
  exactPlan,
  exactUnit,
  formatDecimal,
  formatFraction,
  fractionToNumber,
  generateCandidates,
  parsePrice,
  sellAllPlan,
  shieldPlan,
  simulatePartialFill,
} from "./logic.mjs";

const form = document.querySelector("#calculatorForm");
const targetReadout = document.querySelector("#targetReadout");
const riskReadout = document.querySelector("#riskReadout");
const nudgeOutput = document.querySelector("#nudgeOutput");
const recommendation = document.querySelector("#recommendation");
const recommendationTitle = document.querySelector("#recommendationTitle");
const recommendationCopy = document.querySelector("#recommendationCopy");
const recommendationRate = document.querySelector("#recommendationRate");
const resultGrid = document.querySelector("#resultGrid");
const template = document.querySelector("#strategyTemplate");
const simulatorFields = ["simHave", "simWant", "simFillHave", "simFillWant"].map((id) =>
  document.querySelector(`#${id}`),
);
const simOutput = document.querySelector("#simOutput");

function formValue(name) {
  const field = form.elements[name];
  return field?.value ?? "";
}

function checkedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value;
}

function intValue(name, fallback) {
  const value = Number.parseInt(formValue(name), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pct(value, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function itemLabel(raw, fallback) {
  return String(raw || fallback).trim() || fallback;
}

function describeRows(rows, haveLabel, wantLabel) {
  return rows
    .map((row) => `${row.have} ${haveLabel} -> ${row.want} ${wantLabel}${row.repeat > 1 ? ` x${row.repeat}` : ""}`)
    .join(", ");
}

function metric(label, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
}

function appendOrderRows(table, rows, haveLabel, wantLabel) {
  for (const row of rows) {
    const orderRow = document.createElement("div");
    orderRow.className = "order-row";
    orderRow.setAttribute("role", "row");

    const have = document.createElement("span");
    have.textContent = row.haveText ?? `${row.have} ${haveLabel}`.trim();
    const want = document.createElement("span");
    want.textContent = row.wantText ?? `${row.want} ${wantLabel}`.trim();
    const repeat = document.createElement("span");
    repeat.textContent = row.repeatText ?? `x${row.repeat ?? 1}`;

    orderRow.append(have, want, repeat);
    table.append(orderRow);
  }
}

function renderCard(strategy, haveLabel, wantLabel) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector(".strategy-kind").textContent = strategy.kind;
  node.querySelector("h3").textContent = strategy.title;
  node.querySelector(".strategy-note").textContent = strategy.note;

  const risk = node.querySelector(".risk-pill");
  risk.textContent = strategy.risk.label;
  risk.classList.add(`risk-${strategy.risk.level}`);

  appendOrderRows(node.querySelector(".order-table"), strategy.rows, haveLabel, wantLabel);

  if (strategy.leftover) {
    appendOrderRows(
      node.querySelector(".order-table"),
      strategy.leftover.usable
        ? [
            {
              have: strategy.leftover.have,
              want: strategy.leftover.want,
              repeat: 1,
            },
          ]
        : [
            {
              haveText: `Hold ${strategy.leftover.have} ${haveLabel}`,
              wantText: `or use sell-all`,
              repeatText: "note",
            },
          ],
      haveLabel,
      wantLabel,
    );
  }

  const metrics = node.querySelector(".metrics");
  metrics.append(
    metric("Rate", formatDecimal(strategy.rate, 6)),
    metric("Drift", pct(strategy.error)),
    metric("Atom", `${strategy.atom.have}:${strategy.atom.want}`),
  );

  return node;
}

function cardFromPlan(kind, title, note, plan) {
  return {
    kind,
    title,
    note,
    rows: plan.rows,
    leftover: plan.leftover,
    rate: plan.rate,
    error: plan.error,
    atom: plan.atom,
    risk: plan.risk,
    score: plan.score,
  };
}

function renderError(error) {
  resultGrid.innerHTML = "";
  recommendationTitle.textContent = "Check the ratio";
  recommendationCopy.textContent = error.message;
  recommendationRate.textContent = "-";
  const box = document.createElement("div");
  box.className = "error-box";
  box.textContent = error.message;
  resultGrid.append(box);
}

function planStrategies(price, totalHave, slots, maxAtomic, maxDrift, rounding) {
  const candidates = generateCandidates(price, {
    maxAtomic,
    maxDrift,
    rounding,
  });
  const plans = candidates
    .map((candidate) =>
      buildPlan(candidate, totalHave, slots, price, {
        rounding,
        maxLeftoverDrift: maxDrift,
      }),
    )
    .filter((plan) => plan.rows.length > 0)
    .sort((a, b) => a.score - b.score);

  const recommended = plans[0] ?? exactPlan(price, totalHave, slots, rounding);
  const lowestRisk =
    [...plans].sort((a, b) => {
      const byAtom = a.atom.have - b.atom.have;
      if (byAtom !== 0) return byAtom;
      return Math.abs(a.error) - Math.abs(b.error);
    })[0] ?? recommended;
  const closest = plans[0] ?? recommended;
  const all = sellAllPlan(price, totalHave, slots, rounding) ?? recommended;
  const shielded = shieldPlan(recommended);
  const exact = exactPlan(price, totalHave, slots, rounding);

  return {
    recommended,
    cards: [
      cardFromPlan(
        "Closest safer split",
        `${recommended.atom.have} -> ${recommended.atom.want}`,
        "Best balance inside your denominator and drift guardrails.",
        recommended,
      ),
      cardFromPlan(
        "Smallest blast radius",
        `${lowestRisk.atom.have} -> ${lowestRisk.atom.want}`,
        "Lower atomic have means less damage when a weird partial fill hits first.",
        lowestRisk,
      ),
      cardFromPlan(
        "Sell all visible",
        `${all.atom.have} -> ${all.atom.want}`,
        "Uses the full quantity when possible, often with a larger atomic unit.",
        all,
      ),
      shielded
        ? cardFromPlan(
            "Shielded posting",
            `${shielded.atom.have} -> ${shielded.atom.want} first`,
            "Post the small row first, then the bulk row after it so the first row absorbs early odd fills.",
            shielded,
          )
        : cardFromPlan(
            "Exact fraction",
            `${exact.atom.have} -> ${exact.atom.want}`,
            "Exact market math, but high denominators are usually the fragile path.",
            exact,
          ),
      cardFromPlan(
        "Exact fraction",
        `${exact.atom.have} -> ${exact.atom.want}`,
        "Matches the typed price exactly. Use this to see why tiny fills can delete big rows.",
        exact,
      ),
    ],
  };
}

function updateSimulator() {
  try {
    const [orderHave, orderWant, fillHave, fillWant] = simulatorFields.map((field) =>
      Number.parseInt(field.value, 10),
    );
    const result = simulatePartialFill(orderHave, orderWant, fillHave, fillWant);

    if (result.complete) {
      simOutput.innerHTML = `That fill completes or overfills the row. Original rate was <strong>${formatDecimal(
        result.originalRate,
        6,
      )}</strong>.`;
      return;
    }

    const verdict = result.sameRatio
      ? "The remaining row keeps the same ratio."
      : "The remaining row needs a different ratio, which is the risky failure case.";
    simOutput.innerHTML = `
      Original ${formatDecimal(result.originalRate, 6)}, fill ${formatDecimal(
        result.fillRate,
        6,
      )}, remaining ${result.remainingHave} -> ${result.remainingWant}
      at <strong>${formatDecimal(result.remainingRate, 6)}</strong>. ${verdict}
    `;
  } catch (error) {
    simOutput.textContent = error.message;
  }
}

function render() {
  try {
    const ratioMode = checkedValue("ratioMode");
    const parsedPrice = parsePrice(formValue("ratioInput"), ratioMode);
    const nudgeBps = Number.parseInt(formValue("nudgeBps"), 10) || 0;
    const price = applyNudge(parsedPrice, nudgeBps);
    const totalHave = intValue("totalHave", 108);
    const slots = intValue("slots", 10);
    const maxAtomic = intValue("maxAtomic", 30);
    const maxDrift = Number.parseFloat(formValue("maxDrift")) || 0.01;
    const rounding = checkedValue("rounding");
    const haveLabel = itemLabel(formValue("haveLabel"), "have");
    const wantLabel = itemLabel(formValue("wantLabel"), "want");
    const unit = exactUnit(price);
    const unitRisk = unit.have > 60 ? "fragile" : unit.have > 20 ? "watch it" : "sturdy";

    nudgeOutput.textContent = pct(nudgeBps / 10000, 2);
    targetReadout.textContent = `1 ${haveLabel} -> ${formatDecimal(fractionToNumber(price), 6)} ${wantLabel}`;
    riskReadout.textContent = `Exact unit: ${unit.have} -> ${unit.want} (${formatFraction(price)}, ${unitRisk})`;

    const { recommended, cards } = planStrategies(price, totalHave, slots, maxAtomic, maxDrift, rounding);
    recommendationTitle.textContent = describeRows(recommended.rows.slice(0, 1), haveLabel, wantLabel);
    recommendationCopy.textContent = `Lists ${recommended.totals.have} of ${totalHave} ${haveLabel}. Atomic unit ${
      recommended.atom.have
    }:${recommended.atom.want}, drift ${pct(recommended.error)}, ${recommended.risk.reason.toLowerCase()}`;
    recommendationRate.textContent = formatDecimal(recommended.rate, 6);

    resultGrid.innerHTML = "";
    for (const strategy of cards) {
      resultGrid.append(renderCard(strategy, haveLabel, wantLabel));
    }

    simulatorFields[0].value = recommended.atom.have;
    simulatorFields[1].value = recommended.atom.want;
    simulatorFields[2].value = Math.max(1, Math.min(recommended.atom.have - 1, Math.floor(recommended.atom.have / 3)));
    simulatorFields[3].value = Math.max(1, Math.ceil(recommended.rate * Number(simulatorFields[2].value)));
    updateSimulator();
  } catch (error) {
    renderError(error);
  }
}

form.addEventListener("input", render);
form.addEventListener("change", render);
for (const field of simulatorFields) {
  field.addEventListener("input", updateSimulator);
}

render();
