// @ts-check

import {
  DEFAULT_PARAMS,
  beliefPath,
  exactSummary,
  fixedQuiz,
  likelihoodRatio,
  makeRng,
  probabilityRight,
  simulateClass,
  toOdds,
  verdictFor,
} from "./bayes-tracker.js";

const FIXED_QUESTIONS = 5;
const FIXED_PASS_MARK = 4;

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new () => T} type
 * @returns {T}
 */
function find(selector, type) {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {string} name
 * @param {Record<string, string | number>} attributes
 * @param {string} [text]
 * @returns {SVGElement}
 */
function svg(name, attributes, text) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return /** @type {SVGElement} */ (element);
}

/**
 * Remove everything from an svg except its accessible <title>.
 * @param {SVGElement} root
 */
function clearChart(root) {
  for (const child of [...root.children]) {
    if (child.tagName.toLowerCase() !== "title") {
      child.remove();
    }
  }
}

/** @param {number} value @param {number} digits */
const fixed = (value, digits) => value.toFixed(digits);
/** @param {number} value */
const percent = (value) => `${(value * 100).toFixed(1)}%`;

const params = { ...DEFAULT_PARAMS };
/** @type {boolean[]} */
let answers = [];

const beliefValue = find("[data-belief-value]", HTMLElement);
const meterFill = find("[data-meter-fill]", HTMLElement);
const markLow = find("[data-mark-low]", HTMLElement);
const markHigh = find("[data-mark-high]", HTMLElement);
const labelLow = find("[data-label-low]", HTMLElement);
const labelHigh = find("[data-label-high]", HTMLElement);
const verdictBadge = find("[data-verdict]", HTMLElement);
const rightButton = find('[data-answer="right"]', HTMLButtonElement);
const wrongButton = find('[data-answer="wrong"]', HTMLButtonElement);
const undoButton = find("[data-undo]", HTMLButtonElement);
const resetButton = find("[data-reset]", HTMLButtonElement);
const statCount = find("[data-stat-count]", HTMLElement);
const statOdds = find("[data-stat-odds]", HTMLElement);
const statFactor = find("[data-stat-factor]", HTMLElement);
const chart = find("[data-chart]", SVGElement);
const log = find("[data-log]", HTMLElement);
const eqTotal = find("[data-eq-total]", HTMLElement);
const eqRight = find("[data-eq-right]", HTMLElement);
const eqWrong = find("[data-eq-wrong]", HTMLElement);
const eqOdds = find("[data-eq-odds]", HTMLElement);
const studentsSelect = find("[data-students]", HTMLSelectElement);
const simulateButton = find("[data-simulate]", HTMLButtonElement);
const exactAverage = find("[data-exact-average]", HTMLElement);
const savedCard = find("[data-saved]", HTMLElement);
const precisionCard = find("[data-precision]", HTMLElement);
const precisionNote = find("[data-precision-note]", HTMLElement);
const histogram = find("[data-histogram]", SVGElement);
const simCaption = find("[data-sim-caption]", HTMLElement);

const VERDICT_TEXT = {
  continue: "Keep asking",
  mastered: "Mastered. Stop the quiz.",
  "not-mastered": "Not mastered. Stop the quiz.",
  undecided: "Hit the question limit, still unsure",
};

/** Draw the belief path as a line chart. @param {number[]} path */
function drawBeliefChart(path) {
  clearChart(chart);
  const width = 520;
  const height = 296;
  const left = 46;
  const right = 24;
  const top = 18;
  const bottom = 38;
  const xMax = Math.max(5, path.length - 1);
  const x = (/** @type {number} */ i) => left + ((width - left - right) * i) / xMax;
  const y = (/** @type {number} */ p) => top + (height - top - bottom) * (1 - p);

  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    chart.append(svg("line", { class: "tracker-gridline", x1: left, x2: width - right, y1: y(tick), y2: y(tick) }));
    chart.append(svg("text", { x: left - 8, y: y(tick) + 4, "text-anchor": "end" }, tick.toFixed(2)));
  }
  for (let i = 0; i <= xMax; i += 1) {
    chart.append(svg("text", { x: x(i), y: height - 20, "text-anchor": "middle" }, String(i)));
  }
  chart.append(svg("text", { x: (left + width - right) / 2, y: height - 5, "text-anchor": "middle" }, "Questions answered"));

  for (const [level, label] of /** @type {[number, string][]} */ ([
    [params.high, "mastered"],
    [params.low, "not mastered"],
  ])) {
    chart.append(svg("line", { class: "tracker-threshold", x1: left, x2: width - right, y1: y(level), y2: y(level) }));
    chart.append(
      svg(
        "text",
        { x: width - right - 4, y: y(level) + (level > 0.5 ? -6 : 14), "text-anchor": "end" },
        `${label} ${Math.round(level * 100)}%`,
      ),
    );
  }

  chart.append(svg("polyline", { class: "tracker-line", points: path.map((p, i) => `${x(i)},${y(p)}`).join(" ") }));
  path.forEach((p, i) => {
    const last = i === path.length - 1;
    chart.append(svg("circle", { class: last ? "tracker-dot tracker-dot--last" : "tracker-dot", cx: x(i), cy: y(p), r: last ? 7 : 5 }));
  });
}

/** Rebuild the answer log. @param {number[]} path */
function drawLog(path) {
  log.replaceChildren();
  answers.forEach((correct, i) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `Question ${i + 1}: ${correct ? "right" : "wrong"}`;
    const change = document.createElement("span");
    change.textContent = `${fixed(path[i], 3)} to ${fixed(path[i + 1], 3)}`;
    item.append(name, change);
    log.append(item);
  });
  log.scrollTop = log.scrollHeight;
}

/** Fill the equation box with the current belief. @param {number} belief */
function drawEquations(belief) {
  const { know, guess } = params;
  const pRight = probabilityRight(belief, params);
  const pWrong = 1 - pRight;
  const b = fixed(belief, 3);
  const notB = fixed(1 - belief, 3);

  eqTotal.textContent = `P(right) = ${fixed(know, 2)}(${b}) + ${fixed(guess, 2)}(${notB}) = ${fixed(pRight, 3)}`;
  eqRight.textContent = `P(knows | right) = ${fixed(know, 2)}(${b}) / ${fixed(pRight, 3)} = ${fixed((know * belief) / pRight, 3)}`;
  eqWrong.textContent = `P(knows | wrong) = ${fixed(1 - know, 2)}(${b}) / ${fixed(pWrong, 3)} = ${fixed(((1 - know) * belief) / pWrong, 3)}`;

  const odds = toOdds(belief);
  eqOdds.textContent =
    `odds = ${b} / ${notB} = ${fixed(odds, 3)}\n` +
    `right: ${fixed(odds, 3)} x ${fixed(likelihoodRatio(true, params), 2)} = ${fixed(odds * likelihoodRatio(true, params), 3)}\n` +
    `wrong: ${fixed(odds, 3)} x ${fixed(likelihoodRatio(false, params), 3)} = ${fixed(odds * likelihoodRatio(false, params), 3)}`;
  eqOdds.style.whiteSpace = "pre-line";
}

/** Update the whole quiz side of the page. */
function renderQuiz() {
  const path = beliefPath(answers, params);
  const belief = path[path.length - 1];
  const verdict = verdictFor(belief, answers.length, params);

  beliefValue.textContent = percent(belief);
  meterFill.style.width = `${belief * 100}%`;
  meterFill.style.background = verdict === "mastered" ? "var(--navy)" : verdict === "not-mastered" ? "var(--slate)" : "";
  markLow.style.left = `${params.low * 100}%`;
  markHigh.style.left = `${params.high * 100}%`;
  labelLow.textContent = `not mastered ${Math.round(params.low * 100)}%`;
  labelHigh.textContent = `mastered ${Math.round(params.high * 100)}%`;

  verdictBadge.textContent = VERDICT_TEXT[verdict];
  verdictBadge.dataset.state = verdict;

  const finished = verdict !== "continue";
  rightButton.disabled = finished;
  wrongButton.disabled = finished;
  undoButton.disabled = answers.length === 0;
  resetButton.disabled = answers.length === 0;

  statCount.textContent = String(answers.length);
  statOdds.textContent = fixed(toOdds(belief), 2);
  statFactor.textContent =
    answers.length === 0
      ? "none yet"
      : `x ${fixed(likelihoodRatio(answers[answers.length - 1], params), answers[answers.length - 1] ? 1 : 3)}`;

  drawBeliefChart(path);
  drawLog(path);
  drawEquations(belief);
}

/** @param {boolean} correct */
function answer(correct) {
  const path = beliefPath(answers, params);
  if (verdictFor(path[path.length - 1], answers.length, params) !== "continue") {
    return;
  }
  answers = [...answers, correct];
  renderQuiz();
}

/** Bars showing how many questions each simulated student needed. @param {number[]} counts @param {number} students */
function drawHistogram(counts, students) {
  clearChart(histogram);
  const width = 520;
  const height = 240;
  const left = 40;
  const right = 16;
  const top = 22;
  const bottom = 38;
  let last = counts.length - 1;
  while (last > 1 && counts[last] === 0) {
    last -= 1;
  }
  const bins = counts.slice(0, last + 1);
  const peak = Math.max(...bins);
  const slot = (width - left - right) / bins.length;
  const barWidth = Math.min(40, slot * 0.7);

  histogram.append(svg("line", { class: "tracker-axis", x1: left, x2: width - right, y1: height - bottom, y2: height - bottom }));
  bins.forEach((count, i) => {
    const barHeight = peak === 0 ? 0 : ((height - top - bottom) * count) / peak;
    const cx = left + slot * i + slot / 2;
    histogram.append(
      svg("rect", {
        class: count === peak ? "tracker-bar tracker-bar--peak" : "tracker-bar",
        x: cx - barWidth / 2,
        y: height - bottom - barHeight,
        width: barWidth,
        height: barHeight,
        rx: 4,
      }),
    );
    histogram.append(svg("text", { x: cx, y: height - bottom + 16, "text-anchor": "middle" }, String(i)));
    if (count / students >= 0.005) {
      histogram.append(
        svg("text", { class: "tracker-value", x: cx, y: height - bottom - barHeight - 5, "text-anchor": "middle" }, `${Math.round((count / students) * 100)}%`),
      );
    }
  });
  histogram.append(svg("text", { x: (left + width - right) / 2, y: height - 4, "text-anchor": "middle" }, "Questions the student needed"));
}

/** Exact numbers that change with the sliders. */
function renderExact() {
  const exact = exactSummary(params);
  const fixedResult = fixedQuiz(FIXED_QUESTIONS, FIXED_PASS_MARK, params);
  exactAverage.textContent = fixed(exact.overall, 2);
  savedCard.textContent = fixed(FIXED_QUESTIONS - exact.overall, 2);
  precisionCard.textContent = percent(exact.masteredCallIsRight);
  precisionNote.textContent = `fixed quiz: ${percent(fixedResult.passIsRight)}`;
}

function runSimulation() {
  const students = Number(studentsSelect.value);
  const random = makeRng(Math.floor(Math.random() * 2 ** 32));
  const result = simulateClass(students, params, random);
  const exact = exactSummary(params);
  drawHistogram(result.histogram, students);
  precisionCard.textContent = percent(result.masteredCallIsRight);
  simCaption.textContent =
    `Simulated ${students.toLocaleString()} students: average ${fixed(result.average, 2)} questions ` +
    `(exact answer ${fixed(exact.overall, 2)}). The fixed quiz always asks ${FIXED_QUESTIONS}.`;
}

for (const button of [rightButton, wrongButton]) {
  button.addEventListener("click", () => answer(button === rightButton));
}
undoButton.addEventListener("click", () => {
  answers = answers.slice(0, -1);
  renderQuiz();
});
resetButton.addEventListener("click", () => {
  answers = [];
  renderQuiz();
});
simulateButton.addEventListener("click", runSimulation);

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  if (event.key === "r" || event.key === "R") {
    answer(true);
  } else if (event.key === "w" || event.key === "W") {
    answer(false);
  }
});

for (const slider of document.querySelectorAll("[data-param]")) {
  if (!(slider instanceof HTMLInputElement)) {
    continue;
  }
  const key = /** @type {"prior" | "know" | "guess"} */ (slider.dataset.param);
  const output = find(`[data-out="${key}"]`, HTMLElement);
  slider.addEventListener("input", () => {
    params[key] = Number(slider.value);
    output.textContent = fixed(params[key], 2);
    renderQuiz();
    renderExact();
    runSimulation();
  });
}

renderQuiz();
renderExact();
runSimulation();
