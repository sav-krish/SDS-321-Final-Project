import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PARAMS,
  beliefPath,
  binomialAtLeast,
  exactSummary,
  fixedQuiz,
  makeRng,
  probabilityRight,
  simulateClass,
  updateBelief,
  verdictFor,
} from "../bayes-tracker.js";

const close = (actual, expected, tolerance = 0.0005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);

test("one answer follows Bayes' rule with the Law of Total Probability", () => {
  close(probabilityRight(0.3, DEFAULT_PARAMS), 0.445);
  close(updateBelief(0.3, true, DEFAULT_PARAMS), 0.27 / 0.445);
  close(updateBelief(0.3, false, DEFAULT_PARAMS), 0.03 / 0.555);
});

test("each posterior becomes the next prior", () => {
  const one = updateBelief(0.3, true, DEFAULT_PARAMS);
  const two = updateBelief(one, true, DEFAULT_PARAMS);
  const three = updateBelief(two, true, DEFAULT_PARAMS);
  close(one, 0.607);
  close(two, 0.847);
  close(three, 0.952);
});

test("three right answers in a row reach the mastered line", () => {
  const path = beliefPath([true, true, true], DEFAULT_PARAMS);
  close(path[3], 20 / 21);
  assert.equal(verdictFor(path[2], 2, DEFAULT_PARAMS), "continue");
  assert.equal(verdictFor(path[3], 3, DEFAULT_PARAMS), "mastered");
});

test("two wrong answers in a row mark a student not mastered", () => {
  const path = beliefPath([false, false], DEFAULT_PARAMS);
  assert.equal(verdictFor(path[2], 2, DEFAULT_PARAMS), "not-mastered");
});

test("the exact expected quiz length matches the worked numbers", () => {
  const summary = exactSummary(DEFAULT_PARAMS);
  close(summary.ifKnows, 3.927, 0.001);
  close(summary.ifGuessing, 2.842, 0.001);
  close(summary.overall, 3.168, 0.001);
  close(summary.masteredCallIsRight, 0.957, 0.001);
});

test("a fixed five question quiz compares at the same accuracy", () => {
  close(binomialAtLeast(5, 4, 0.25), 0.0156, 0.0001);
  close(fixedQuiz(5, 4, DEFAULT_PARAMS).passIsRight, 0.962, 0.001);
});

test("a simulated class agrees with the exact average", () => {
  const result = simulateClass(20000, DEFAULT_PARAMS, makeRng(321));
  close(result.average, exactSummary(DEFAULT_PARAMS).overall, 0.05);
  assert.equal(result.histogram.reduce((sum, count) => sum + count, 0), 20000);
});
