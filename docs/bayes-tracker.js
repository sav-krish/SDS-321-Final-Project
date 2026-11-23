// @ts-check

/**
 * Bayesian mastery tracking for a short quiz.
 *
 * A student either knows the topic (M = 1) or is guessing (M = 0). Each answer
 * is evidence, so the belief P(M = 1) is updated with Bayes' rule after every
 * question, and the quiz stops once the belief is high or low enough.
 */

/**
 * @typedef {object} Params
 * @property {number} prior  P(M = 1) before the first question
 * @property {number} know   P(right | M = 1), one minus the slip rate
 * @property {number} guess  P(right | M = 0), for example 0.25 on four choices
 * @property {number} high   stop and call the student mastered at this belief
 * @property {number} low    stop and call the student not mastered at this belief
 * @property {number} cap    most questions that will ever be asked
 */

/** @type {Params} */
export const DEFAULT_PARAMS = {
  prior: 0.3,
  know: 0.9,
  guess: 0.25,
  high: 0.95,
  low: 0.05,
  cap: 12,
};

/**
 * Law of Total Probability: the chance the next answer is right.
 * @param {number} belief
 * @param {Params} params
 * @returns {number}
 */
export function probabilityRight(belief, params) {
  return params.know * belief + params.guess * (1 - belief);
}

/**
 * Bayes' rule: P(M = 1 | answer).
 * @param {number} belief
 * @param {boolean} correct
 * @param {Params} params
 * @returns {number}
 */
export function updateBelief(belief, correct, params) {
  const likeKnow = correct ? params.know : 1 - params.know;
  const likeGuess = correct ? params.guess : 1 - params.guess;
  const numerator = likeKnow * belief;
  return numerator / (numerator + likeGuess * (1 - belief));
}

/** @typedef {"continue" | "mastered" | "not-mastered" | "undecided"} Verdict */

/**
 * @param {number} belief
 * @param {number} answered
 * @param {Params} params
 * @returns {Verdict}
 */
export function verdictFor(belief, answered, params) {
  if (belief >= params.high) {
    return "mastered";
  }
  if (belief <= params.low) {
    return "not-mastered";
  }
  return answered >= params.cap ? "undecided" : "continue";
}

/**
 * Belief after each answer, starting with the prior.
 * @param {boolean[]} answers
 * @param {Params} params
 * @returns {number[]}
 */
export function beliefPath(answers, params) {
  const path = [params.prior];
  for (const correct of answers) {
    path.push(updateBelief(path[path.length - 1], correct, params));
  }
  return path;
}

/**
 * Exact expected quiz length and the chance of a mastered call, found by
 * adding up every possible sequence of answers weighted by its probability.
 * @param {boolean} knows whether the student really knows the topic
 * @param {Params} params
 * @returns {{ length: number, mastered: number }}
 */
function exactFor(knows, params) {
  const pRight = knows ? params.know : params.guess;
  /** @type {Map<string, { length: number, mastered: number }>} */
  const memo = new Map();

  /**
   * @param {number} right
   * @param {number} wrong
   * @param {number} belief
   * @returns {{ length: number, mastered: number }}
   */
  function walk(right, wrong, belief) {
    const verdict = verdictFor(belief, right + wrong, params);
    if (verdict !== "continue") {
      return { length: 0, mastered: verdict === "mastered" ? 1 : 0 };
    }
    const key = `${right},${wrong}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }
    const ifRight = walk(right + 1, wrong, updateBelief(belief, true, params));
    const ifWrong = walk(right, wrong + 1, updateBelief(belief, false, params));
    const result = {
      length: 1 + pRight * ifRight.length + (1 - pRight) * ifWrong.length,
      mastered: pRight * ifRight.mastered + (1 - pRight) * ifWrong.mastered,
    };
    memo.set(key, result);
    return result;
  }

  return walk(0, 0, params.prior);
}

/**
 * E[N] = E[N | M = 1] P(M = 1) + E[N | M = 0] P(M = 0), plus how often the
 * quiz calls a student mastered and how often that call is correct.
 * @param {Params} params
 * @returns {{ ifKnows: number, ifGuessing: number, overall: number, calledMasteredIfKnows: number, calledMasteredIfGuessing: number, masteredCallIsRight: number }}
 */
export function exactSummary(params) {
  const knows = exactFor(true, params);
  const guessing = exactFor(false, params);
  const calledMastered = params.prior * knows.mastered + (1 - params.prior) * guessing.mastered;
  return {
    ifKnows: knows.length,
    ifGuessing: guessing.length,
    overall: params.prior * knows.length + (1 - params.prior) * guessing.length,
    calledMasteredIfKnows: knows.mastered,
    calledMasteredIfGuessing: guessing.mastered,
    masteredCallIsRight: calledMastered === 0 ? 0 : (params.prior * knows.mastered) / calledMastered,
  };
}

/**
 * P(X >= k) for X ~ Binomial(n, p).
 * @param {number} n
 * @param {number} k
 * @param {number} p
 * @returns {number}
 */
export function binomialAtLeast(n, k, p) {
  let total = 0;
  for (let i = k; i <= n; i += 1) {
    let choose = 1;
    for (let j = 1; j <= i; j += 1) {
      choose = (choose * (n - i + j)) / j;
    }
    total += choose * p ** i * (1 - p) ** (n - i);
  }
  return total;
}

/**
 * A fixed quiz of n questions where the student passes with at least k right.
 * @param {number} n
 * @param {number} k
 * @param {Params} params
 * @returns {{ passIfKnows: number, passIfGuessing: number, passIsRight: number }}
 */
export function fixedQuiz(n, k, params) {
  const passIfKnows = binomialAtLeast(n, k, params.know);
  const passIfGuessing = binomialAtLeast(n, k, params.guess);
  const passed = params.prior * passIfKnows + (1 - params.prior) * passIfGuessing;
  return {
    passIfKnows,
    passIfGuessing,
    passIsRight: passed === 0 ? 0 : (params.prior * passIfKnows) / passed,
  };
}

/**
 * Small seeded generator so a demo run can be repeated.
 * @param {number} seed
 * @returns {() => number}
 */
export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run one student through the adaptive quiz.
 * @param {boolean} knows
 * @param {Params} params
 * @param {() => number} random
 * @returns {{ questions: number, verdict: Verdict }}
 */
export function runStudent(knows, params, random) {
  const pRight = knows ? params.know : params.guess;
  let belief = params.prior;
  let questions = 0;
  let verdict = verdictFor(belief, questions, params);
  while (verdict === "continue") {
    belief = updateBelief(belief, random() < pRight, params);
    questions += 1;
    verdict = verdictFor(belief, questions, params);
  }
  return { questions, verdict };
}

/**
 * Simulate a class: each student knows the topic with probability prior.
 * @param {number} students
 * @param {Params} params
 * @param {() => number} random
 * @returns {{ students: number, average: number, histogram: number[], calledMastered: number, masteredCallIsRight: number }}
 */
export function simulateClass(students, params, random) {
  const histogram = new Array(params.cap + 1).fill(0);
  let totalQuestions = 0;
  let calledMastered = 0;
  let calledMasteredAndKnew = 0;
  for (let i = 0; i < students; i += 1) {
    const knows = random() < params.prior;
    const { questions, verdict } = runStudent(knows, params, random);
    histogram[questions] += 1;
    totalQuestions += questions;
    if (verdict === "mastered") {
      calledMastered += 1;
      if (knows) {
        calledMasteredAndKnew += 1;
      }
    }
  }
  return {
    students,
    average: totalQuestions / students,
    histogram,
    calledMastered,
    masteredCallIsRight: calledMastered === 0 ? 0 : calledMasteredAndKnew / calledMastered,
  };
}
