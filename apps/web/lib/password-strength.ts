import type { Score, ZxcvbnResult } from '@zxcvbn-ts/core';

/**
 * Password-strength analysis + strong-password suggestions for JB Mercantile.
 *
 * - Strength estimation uses `@zxcvbn-ts/core` (v4, maintained TypeScript fork of
 *   zxcvbn) with the `language-common` + `language-en` dictionaries. The original
 *   `zxcvbn` package (last published 2017, untyped, ~800 KB monolith) was rejected
 *   in favour of the modular, tree-shakeable implementation.
 * - The estimator is loaded lazily via dynamic `import()` so its dictionaries only
 *   enter bundles/routes that render password-strength UI. Nothing here ever sends
 *   a password anywhere: analysis runs locally in the browser.
 * - Suggestions are generated with `crypto.getRandomValues` (never a weak,
 *   seedable, or hard-coded source, never derived from personal data) and then
 *   *evaluated* with the estimator. zxcvbn estimates strength; it is not a
 *   password generator.
 * - The backend (min 8 chars, max 128 on change; bcrypt-12 server-side) remains the
 *   authority. No client score, flag, or label is ever trusted for authentication,
 *   logged, or persisted.
 */

export type StrengthScore = Score; // 0 | 1 | 2 | 3 | 4

export const STRENGTH_LABELS: Record<StrengthScore, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

export type StrengthState = 'empty' | 'ready' | 'unavailable';

export interface PasswordStrengthResult {
  state: StrengthState;
  /** Always 0 for `empty`/`unavailable` — callers must never render those as acceptable. */
  score: StrengthScore;
  /** Display label; empty string while the field is empty. */
  label: string;
  guesses: number | null;
  /**
   * Offline slow-hashing estimate from the model (e.g. "5 years"). A model-based
   * approximation under fixed attack assumptions — never a real-world prediction.
   */
  crackTimeDisplay: string | null;
  warning: string | null;
  /** At most two prioritised, estimator-relevant recommendations. */
  advice: string[];
}

/** Minimal estimator surface so tests can inject fakes without the dictionaries. */
export interface StrengthChecker {
  check(password: string, userInputs?: Array<string | number>): ZxcvbnResult;
}

/** Upper bound analysed per keystroke; matches the estimator default and keeps typing cheap. */
export const ANALYSIS_MAX_LENGTH = 256;

/** Backend-compatible suggestion format (server requires 8–128 characters, any charset). */
export const SUGGESTION_LENGTH = 16;
export const SUGGESTION_COUNT = 3;
/**
 * 64 unambiguous characters (no 0/O/1/l/I). 64 = 2^6, so masking a uniform byte
 * with `& 63` selects uniformly with zero modulo bias. 16 chars ≈ 96 bits.
 */
export const SUGGESTION_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*?';
/** Aim for top-score candidates; accept honestly-labelled weaker ones rather than looping forever. */
export const MIN_SUGGESTION_SCORE: StrengthScore = 4;
export const MAX_SUGGESTION_ATTEMPTS = 30;

export interface PasswordSuggestion {
  password: string;
  score: StrengthScore;
  label: string;
}

let estimatorPromise: Promise<StrengthChecker> | null = null;

/**
 * Lazily construct the estimator (dynamic imports keep dictionaries out of
 * unrelated route bundles). The promise is cached; a failed load resets the
 * cache so a later retry can succeed.
 */
export function loadStrengthEstimator(): Promise<StrengthChecker> {
  if (!estimatorPromise) {
    estimatorPromise = (async () => {
      const [{ ZxcvbnFactory }, common, english] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);
      return new ZxcvbnFactory({
        translations: english.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...english.dictionary },
      });
    })().catch((error: unknown) => {
      estimatorPromise = null;
      throw error;
    });
  }
  return estimatorPromise;
}

/**
 * Pure mapping from an estimator result to the application-level result.
 * Pass `null` when the estimator is unavailable (load failure) to get the
 * explicit `unavailable` state instead of a misleading score.
 */
export function analyzeStrength(password: string, result: ZxcvbnResult | null): PasswordStrengthResult {
  if (!password) {
    return {
      state: 'empty',
      score: 0,
      label: '',
      guesses: null,
      crackTimeDisplay: null,
      warning: null,
      advice: [],
    };
  }
  if (!result) {
    return {
      state: 'unavailable',
      score: 0,
      label: '',
      guesses: null,
      crackTimeDisplay: null,
      warning: null,
      advice: [],
    };
  }
  const score = result.score;
  const advice = (result.feedback.suggestions ?? []).filter(Boolean).slice(0, 2);
  if (advice.length === 0 && score <= 2) {
    advice.push('Consider using a longer password made of several unrelated words.');
  }
  return {
    state: 'ready',
    score,
    label: STRENGTH_LABELS[score],
    guesses: typeof result.guesses === 'number' ? result.guesses : null,
    crackTimeDisplay: result.crackTimes?.offlineSlowHashingXPerSecond?.display ?? null,
    warning: result.feedback.warning ?? null,
    advice,
  };
}

/**
 * Analyse a password end-to-end (loads the estimator on first use). Never
 * rejects because of estimator problems: failures resolve to `unavailable`.
 * Callers may pass user attributes (name, email) so personal-data matches are
 * flagged — those inputs are used for local matching only, never stored.
 */
export async function getPasswordStrength(
  password: string,
  userInputs: string[] = [],
): Promise<PasswordStrengthResult> {
  if (!password) return analyzeStrength('', null);
  try {
    const estimator = await loadStrengthEstimator();
    const inputs = userInputs.map((v) => v.trim()).filter(Boolean).slice(0, 5);
    return analyzeStrength(password, estimator.check(password.slice(0, ANALYSIS_MAX_LENGTH), inputs));
  } catch {
    return analyzeStrength(password, null);
  }
}

export type RandomValuesFn = (array: Uint32Array) => Uint32Array;

function defaultRandomValues(array: Uint32Array): Uint32Array {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.getRandomValues) {
    throw new Error('Secure random number generation is not available in this browser.');
  }
  return cryptoRef.getRandomValues(array);
}

function randomCandidate(length: number, randomValues: RandomValuesFn): string {
  const bytes = randomValues(new Uint32Array(length));
  const alphabetLength = SUGGESTION_ALPHABET.length; // 64 — `& 63` is exactly uniform.
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SUGGESTION_ALPHABET[(bytes[i] ?? 0) & (alphabetLength - 1)];
  }
  return out;
}

export interface SuggestionRequest {
  count?: number;
  length?: number;
  minScore?: StrengthScore;
  maxAttempts?: number;
  randomValues?: RandomValuesFn;
  /** Dependency-injected scorer (production: the loaded estimator). */
  scoreCandidate?: (password: string) => StrengthScore | Promise<StrengthScore>;
}

export interface SuggestionOutcome {
  suggestions: PasswordSuggestion[];
  /** True when every returned suggestion meets `minScore`. Always honest — never inflated. */
  targetMet: boolean;
}

/**
 * Generate strong, independent password candidates. Each candidate comes from
 * `crypto.getRandomValues` (injectable for tests) and is evaluated with the
 * estimator; the best `count` are returned, preferring top scores. Terminates
 * after `maxAttempts` — never loops indefinitely.
 */
export async function suggestPasswords(request: SuggestionRequest = {}): Promise<SuggestionOutcome> {
  const {
    count = SUGGESTION_COUNT,
    length = SUGGESTION_LENGTH,
    minScore = MIN_SUGGESTION_SCORE,
    maxAttempts = MAX_SUGGESTION_ATTEMPTS,
    randomValues = defaultRandomValues,
    scoreCandidate,
  } = request;

  const scorer =
    scoreCandidate ??
    (async (password: string): Promise<StrengthScore> => {
      const estimator = await loadStrengthEstimator();
      return estimator.check(password).score;
    });

  const seen = new Set<string>();
  const scored: PasswordSuggestion[] = [];
  const attempts = Math.max(count, maxAttempts);
  let meetingTarget = 0;
  for (let i = 0; i < attempts && scored.length < count * 3 && meetingTarget < count; i += 1) {
    const candidate = randomCandidate(length, randomValues);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const score = await scorer(candidate);
    if (score >= minScore) meetingTarget += 1;
    scored.push({ password: candidate, score, label: STRENGTH_LABELS[score] });
  }
  scored.sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, Math.max(0, count));
  return {
    suggestions,
    targetMet: suggestions.length > 0 && suggestions.every((s) => s.score >= minScore),
  };
}

/**
 * Copy a password after an explicit user action. Uses the async clipboard API
 * with a legacy textarea fallback; never copies automatically and never logs.
 */
export async function copyPasswordToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy fallback below.
  }
  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
