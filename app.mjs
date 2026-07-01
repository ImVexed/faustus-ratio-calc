import {
  applyNudge,
  buildPlan,
  exactUnit,
  formatDecimal,
  fractionToNumber,
  generateCandidates,
  parsePrice,
  sellAllPlan,
} from "./logic.mjs";

const form = document.querySelector("#calculatorForm");
const totalHaveInput = document.querySelector("#totalHave");
const ratioInput = document.querySelector("#ratioInput");
const ratioSlider = document.querySelector("#ratioSlider");
const ratioSliderOutput = document.querySelector("#ratioSliderOutput");
const nudgeInput = document.querySelector("#nudgeBps");
const nudgeOutput = document.querySelector("#nudgeOutput");
const flipRatio = document.querySelector("#flipRatio");
const targetSummary = document.querySelector("#targetSummary");
const mainListing = document.querySelector("#mainListing");
const mainCopy = document.querySelector("#mainCopy");
const sellAllListing = document.querySelector("#sellAllListing");
const sellAllCopy = document.querySelector("#sellAllCopy");
const exactListing = document.querySelector("#exactListing");
const exactCopy = document.querySelector("#exactCopy");

let syncingSlider = false;
const sliderMinPrice = 0.1;
const sliderMaxPrice = 25;

function intValue(input, fallback) {
  const value = Number.parseInt(input.value, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pct(value, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

function formatPrice(value, digits = 4) {
  return formatDecimal(value, digits);
}

function formatListing(row) {
  return `${row.have} for ${row.want}`;
}

function sliderToPrice(value) {
  const position = Number(value) / 1000;
  return sliderMinPrice * (sliderMaxPrice / sliderMinPrice) ** position;
}

function priceToSlider(value) {
  const bounded = Math.min(Math.max(value, sliderMinPrice), sliderMaxPrice);
  return Math.round((Math.log(bounded / sliderMinPrice) / Math.log(sliderMaxPrice / sliderMinPrice)) * 1000);
}

function planFromPrice(price, totalHave) {
  const maxAtomic = Math.min(Math.max(30, Math.ceil(totalHave / 3)), Math.max(2, totalHave));
  const attempts = [
    { maxAtomic, maxDrift: 0.01 },
    { maxAtomic: Math.min(Math.max(60, maxAtomic), Math.max(2, totalHave)), maxDrift: 0.025 },
    { maxAtomic: Math.min(Math.max(100, maxAtomic), Math.max(2, totalHave)), maxDrift: 0.05 },
  ];

  for (const attempt of attempts) {
    const plans = generateCandidates(price, {
      maxAtomic: attempt.maxAtomic,
      maxDrift: attempt.maxDrift,
      rounding: "atLeast",
    })
      .map((candidate) =>
        buildPlan(candidate, totalHave, totalHave, price, {
          rounding: "atLeast",
          maxLeftoverDrift: attempt.maxDrift,
        }),
      )
      .filter((plan) => plan.rows.length > 0)
      .sort((a, b) => a.score - b.score);

    if (plans[0]) return plans[0];
  }

  const unit = exactUnit(price);
  return buildPlan(
    {
      have: unit.have,
      want: unit.want,
      error: 0,
      rate: unit.want / unit.have,
    },
    totalHave,
    totalHave,
    price,
    { rounding: "atLeast" },
  );
}

function syncRatioSlider(basePrice) {
  const value = fractionToNumber(basePrice);
  ratioSliderOutput.textContent = formatPrice(value);

  syncingSlider = true;
  ratioSlider.value = String(priceToSlider(value));
  syncingSlider = false;
}

function renderError(message) {
  mainListing.textContent = "Check ratio";
  mainCopy.textContent = message;
  sellAllListing.textContent = "-";
  sellAllCopy.textContent = "";
  exactListing.textContent = "-";
  exactCopy.textContent = "";
  targetSummary.textContent = message;
}

function render() {
  try {
    const totalHave = intValue(totalHaveInput, 108);
    const basePrice = parsePrice(ratioInput.value);
    const nudgeBps = Number.parseInt(nudgeInput.value, 10) || 0;
    const price = applyNudge(basePrice, nudgeBps);
    const priceNumber = fractionToNumber(price);
    const basePriceNumber = fractionToNumber(basePrice);
    const plan = planFromPrice(price, totalHave);
    const mainRow = plan.rows[0];
    const sellAll = sellAllPlan(price, totalHave, totalHave, "atLeast");
    const exact = exactUnit(price);
    const covered = plan.totals.have;
    const leftover = totalHave - covered;

    syncRatioSlider(basePrice);
    nudgeOutput.textContent = pct(nudgeBps / 10000);
    targetSummary.textContent =
      nudgeBps === 0
        ? `Target: 1 item for ${formatPrice(priceNumber)} currency`
        : `Target: ${formatPrice(basePriceNumber)} nudged to ${formatPrice(priceNumber)}`;

    mainListing.textContent = formatListing(mainRow);
    mainCopy.textContent =
      leftover > 0
        ? `Post ${mainRow.repeat} times. Covers ${covered} of ${totalHave}; keep ${leftover} aside.`
        : `Post ${mainRow.repeat} times. Covers all ${totalHave}.`;

    if (sellAll) {
      sellAllListing.textContent = formatListing(sellAll.rows[0]);
      sellAllCopy.textContent = `Post ${sellAll.rows[0].repeat} times. Covers ${totalHave} at ${formatPrice(
        sellAll.rate,
      )} (${pct(sellAll.error)}).`;
    } else {
      sellAllListing.textContent = "No clean split";
      sellAllCopy.textContent = "Use the main row and hold the leftover.";
    }

    exactListing.textContent = `${exact.have} for ${exact.want}`;
    exactCopy.textContent =
      exact.have > 30
        ? "Exact, but a high denominator."
        : `Exact ratio at ${formatPrice(exact.want / exact.have)}.`;
  } catch (error) {
    renderError(error.message);
  }
}

ratioSlider.addEventListener("input", () => {
  if (syncingSlider) return;
  ratioInput.value = `1:${formatPrice(sliderToPrice(ratioSlider.value), 2)}`;
  render();
});

nudgeInput.addEventListener("input", render);
form.addEventListener("input", (event) => {
  if (event.target === ratioSlider || event.target === nudgeInput) return;
  render();
});

flipRatio.addEventListener("click", () => {
  try {
    const price = parsePrice(ratioInput.value);
    const flipped = 1 / fractionToNumber(price);
    ratioInput.value = `1:${formatPrice(flipped)}`;
    nudgeInput.value = "0";
    render();
  } catch (error) {
    renderError(error.message);
  }
});

render();
