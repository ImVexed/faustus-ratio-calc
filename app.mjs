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
const mainListing = document.querySelector("#mainListing");
const mainCopy = document.querySelector("#mainCopy");
const sellAllListing = document.querySelector("#sellAllListing");
const sellAllCopy = document.querySelector("#sellAllCopy");

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

function formatPlanTotal(plan) {
  return `${plan.totals.have} for ${plan.totals.want}`;
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
  mainCopy.hidden = false;
  sellAllListing.textContent = "-";
  sellAllCopy.textContent = "";
}

function render() {
  try {
    const totalHave = intValue(totalHaveInput, 108);
    const basePrice = parsePrice(ratioInput.value);
    const nudgeBps = Number.parseInt(nudgeInput.value, 10) || 0;
    const price = applyNudge(basePrice, nudgeBps);
    const plan = planFromPrice(price, totalHave);
    const sellAll = sellAllPlan(price, totalHave, totalHave, "atLeast");

    syncRatioSlider(basePrice);
    nudgeOutput.textContent = pct(nudgeBps / 10000);

    mainListing.textContent = formatPlanTotal(plan);
    mainCopy.textContent = "";
    mainCopy.hidden = true;

    if (sellAll) {
      sellAllListing.textContent = formatPlanTotal(sellAll);
      sellAllCopy.textContent = "Nearest whole-number price for the whole stack.";
    } else {
      sellAllListing.textContent = "No clean split";
      sellAllCopy.textContent = "";
    }
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
