import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZxcvbnResult } from '@zxcvbn-ts/core';

import { PasswordStrengthMeter } from '../components/PasswordStrengthMeter';
import {
  ANALYSIS_MAX_LENGTH,
  MIN_SUGGESTION_SCORE,
  STRENGTH_LABELS,
  SUGGESTION_ALPHABET,
  SUGGESTION_COUNT,
  SUGGESTION_LENGTH,
  analyzeStrength,
  copyPasswordToClipboard,
  getPasswordStrength,
  loadStrengthEstimator,
  suggestPasswords,
} from './password-strength';

// Components use the automatic JSX runtime, but vitest transpiles them with
// the classic runtime outside Next/SWC — provide the global they expect.
// Re-stubbed before every test because the clipboard tests unstub globals.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeResult(overrides: Partial<ZxcvbnResult> = {}): ZxcvbnResult {
  return {
    feedback: { warning: null, suggestions: [] },
    crackTimes: {
      onlineThrottlingXPerHour: { base: null, seconds: 1, display: '1 second' },
      onlineNoThrottlingXPerSecond: { base: null, seconds: 1, display: '1 second' },
      offlineSlowHashingXPerSecond: { base: null, seconds: 1, display: '1 second' },
      offlineFastHashingXPerSecond: { base: null, seconds: 1, display: '1 second' },
    },
    score: 0,
    password: 'password',
    guesses: 10,
    guessesLog10: 1,
    sequence: [],
    calcTime: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Strength labels + analysis mapping (pure, no estimator)
// ---------------------------------------------------------------------------

describe('strength labels', () => {
  it('maps all five scores to the specified display labels', () => {
    expect(STRENGTH_LABELS).toEqual({
      0: 'Very weak',
      1: 'Weak',
      2: 'Fair',
      3: 'Strong',
      4: 'Very strong',
    });
  });
});

describe('analyzeStrength mapping', () => {
  it('returns a neutral state for empty input (never an alarming warning)', () => {
    const result = analyzeStrength('', null);
    expect(result.state).toBe('empty');
    expect(result.label).toBe('');
    expect(result.warning).toBeNull();
    expect(result.advice).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('returns an explicit unavailable state when the estimator failed', () => {
    const result = analyzeStrength('something-typed', null);
    expect(result.state).toBe('unavailable');
    expect(result.score).toBe(0);
    expect(result.label).toBe('');
  });

  it('caps advice at the two most useful recommendations', () => {
    const result = analyzeStrength(
      'Password123!',
      fakeResult({
        score: 1,
        feedback: { warning: 'This is similar to a commonly used password.', suggestions: ['one', 'two', 'three'] },
      }),
    );
    expect(result.state).toBe('ready');
    expect(result.label).toBe('Weak');
    expect(result.warning).toContain('commonly used');
    expect(result.advice).toEqual(['one', 'two']);
  });

  it('adds fallback guidance when a weak password has no estimator suggestions', () => {
    const result = analyzeStrength('abcabcabc', fakeResult({ score: 1, feedback: { warning: null, suggestions: [] } }));
    expect(result.advice).toHaveLength(1);
    expect(result.advice[0]).toMatch(/unrelated words/);
  });

  it('passes through guesses and the model-based crack-time display', () => {
    const result = analyzeStrength('x'.repeat(9), fakeResult({ score: 2, guesses: 1000000 }));
    expect(result.guesses).toBe(1000000);
    expect(result.crackTimeDisplay).toBe('1 second');
  });
});

// ---------------------------------------------------------------------------
// Real estimator behaviour (proves strength is estimated, not length-derived)
// ---------------------------------------------------------------------------

describe('real estimator integration', () => {
  it('loads once and reuses the cached instance', async () => {
    const first = await loadStrengthEstimator();
    const second = await loadStrengthEstimator();
    expect(second).toBe(first);
  });

  it('scores a heavily used password 0 with a plain-language warning', async () => {
    const result = await getPasswordStrength('password');
    expect(result.state).toBe('ready');
    expect(result.score).toBe(0);
    expect(result.label).toBe('Very weak');
    expect(result.warning).toMatch(/heavily used/i);
  });

  it('scores predictable patterns low regardless of length', async () => {
    // 12 chars but a straight keyboard run + sequence: length alone must not pass.
    const run = await getPasswordStrength('qwerty123456');
    expect(run.score).toBeLessThanOrEqual(1);
    const repeated = await getPasswordStrength('aaaaaaaaaaaaaaaa');
    expect(repeated.score).toBeLessThanOrEqual(1);
  });

  it('scores a fixed 16-character random candidate 4 (evaluation works)', async () => {
    const result = await getPasswordStrength('K7#mQ9!vT2@xLp4zR');
    expect(result.score).toBe(4);
    expect(result.label).toBe('Very strong');
  });

  it('accepts user attributes for personal-data matching without throwing', async () => {
    const result = await getPasswordStrength('wanjiku-1994!', ['Wanjiku', 'wanjiku@example.com']);
    expect(result.state).toBe('ready');
  });

  it('never rejects on empty input', async () => {
    await expect(getPasswordStrength('')).resolves.toMatchObject({ state: 'empty' });
  });

  it('caps analysis input at the documented maximum', () => {
    expect(ANALYSIS_MAX_LENGTH).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// Suggestion generator
// ---------------------------------------------------------------------------

describe('suggestPasswords generation', () => {
  it('uses the injected secure random source with unbiased alphabet indexing', async () => {
    const seen: number[] = [];
    const outcome = await suggestPasswords({
      count: 1,
      length: 4,
      // Sequential byte values 0..3 must map exactly to the first alphabet chars
      // (`& 63` on a 64-char alphabet is exactly uniform — no modulo bias).
      randomValues: (array) => {
        for (let i = 0; i < array.length; i += 1) {
          array[i] = i;
          seen.push(i);
        }
        return array;
      },
      scoreCandidate: () => 4,
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(outcome.suggestions).toHaveLength(1);
    expect(outcome.suggestions[0].password).toBe(SUGGESTION_ALPHABET.slice(0, 4));
    expect(outcome.targetMet).toBe(true);
  });

  it('derives candidates only from the approved alphabet (never personal data)', async () => {
    const outcome = await suggestPasswords({ count: 3, scoreCandidate: () => 4 });
    expect(outcome.suggestions).toHaveLength(3);
    for (const suggestion of outcome.suggestions) {
      expect(suggestion.password).toHaveLength(SUGGESTION_LENGTH);
      for (const char of suggestion.password) {
        expect(SUGGESTION_ALPHABET).toContain(char);
      }
    }
  });

  it('is not hard-coded: real runs differ', async () => {
    const first = await suggestPasswords({ count: 1, scoreCandidate: () => 4 });
    const second = await suggestPasswords({ count: 1, scoreCandidate: () => 4 });
    expect(first.suggestions[0].password).not.toBe(second.suggestions[0].password);
  });

  it('keeps the 64-char alphabet so `& 63` selection stays unbiased', () => {
    expect(SUGGESTION_ALPHABET).toHaveLength(64);
    expect(new Set(SUGGESTION_ALPHABET).size).toBe(64);
    expect(SUGGESTION_ALPHABET).not.toMatch(/[0OlI]/);
  });

  it('evaluates every candidate and stops early once the target is met', async () => {
    let calls = 0;
    const outcome = await suggestPasswords({
      count: 2,
      scoreCandidate: () => {
        calls += 1;
        return 4;
      },
    });
    expect(outcome.suggestions).toHaveLength(2);
    expect(outcome.targetMet).toBe(true);
    expect(calls).toBe(2);
  });

  it('terminates safely and honestly when candidates keep failing the target', async () => {
    const outcome = await suggestPasswords({
      count: 3,
      minScore: 4,
      maxAttempts: 5,
      scoreCandidate: () => 1,
    });
    expect(outcome.suggestions).toHaveLength(3);
    expect(outcome.targetMet).toBe(false);
    expect(outcome.suggestions.every((s) => s.label === 'Weak')).toBe(true);
  });

  it('fails loudly (not silently weak) when no secure randomness exists', async () => {
    await expect(
      suggestPasswords({
        count: 1,
        randomValues: () => {
          throw new Error('Secure random number generation is not available in this browser.');
        },
        scoreCandidate: () => 4,
      }),
    ).rejects.toThrow(/secure random/i);
  });

  it('evaluates generated candidates with the real estimator by default', async () => {
    const outcome = await suggestPasswords({ count: 2 });
    expect(outcome.suggestions).toHaveLength(2);
    expect(outcome.targetMet).toBe(true);
    expect(outcome.suggestions.every((s) => s.score >= MIN_SUGGESTION_SCORE)).toBe(true);
  }, 30000);

  it('uses getRandomValues (never Math.random) for generation', () => {
    const src = readFileSync(resolve(process.cwd(), 'apps/web/lib/password-strength.ts'), 'utf8');
    expect(src).toContain('getRandomValues');
    expect(src).not.toContain('Math.random');
    expect(src).not.toMatch(/console\.(log|info|debug)/);
    expect(src).not.toContain('localStorage');
    expect(src).not.toContain('sessionStorage');
  });
});

// ---------------------------------------------------------------------------
// Clipboard behaviour
// ---------------------------------------------------------------------------

describe('copyPasswordToClipboard', () => {
  it('returns true on clipboard-API success', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
    await expect(copyPasswordToClipboard('s3cret')).resolves.toBe(true);
  });

  it('returns false gracefully when nothing is available (no throw, no log)', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyPasswordToClipboard('s3cret')).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Meter rendered contract (neutral shell; live estimator runs in the browser)
// ---------------------------------------------------------------------------

describe('PasswordStrengthMeter rendered contract', () => {
  it('renders a neutral, labelled shell for empty input', () => {
    const html = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: '' }));
    expect(html).toContain('Password strength');
    expect(html).toContain('Enter a password');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain('aria-valuetext="No password entered"');
  });

  it('exposes progressive-disclosure suggestions behind a real button', () => {
    const html = renderToStaticMarkup(createElement(PasswordStrengthMeter, { password: '' }));
    expect(html).toContain('type="button"');
    expect(html).toContain('Suggest a strong password');
    // Candidates are NOT rendered by default (no clutter, no premature exposure).
    expect(html).not.toContain('Use this password');
  });

  it('never persists or logs passwords in the component', () => {
    const src = readFileSync(resolve(process.cwd(), 'apps/web/components/PasswordStrengthMeter.tsx'), 'utf8');
    expect(src).not.toContain('localStorage');
    expect(src).not.toContain('sessionStorage');
    expect(src).not.toMatch(/console\.(log|info|debug)/);
  });
});

// ---------------------------------------------------------------------------
// Form integration contracts (static: AuthForms needs next/navigation at runtime)
// ---------------------------------------------------------------------------

const formsSrc = readFileSync(resolve(process.cwd(), 'apps/web/components/AuthForms.tsx'), 'utf8');
const loginBody = formsSrc.slice(formsSrc.indexOf('export function LoginForm'), formsSrc.indexOf('export function RegisterForm'));
const registerBody = formsSrc.slice(formsSrc.indexOf('export function RegisterForm'));
const securitySrc = readFileSync(resolve(process.cwd(), 'apps/web/app/account/security/page.tsx'), 'utf8');

describe('registration integration contract', () => {
  it('mounts the meter with user attributes and an explicit apply rule', () => {
    expect(registerBody).toContain('<PasswordStrengthMeter');
    expect(registerBody).toContain('userInputs=');
    expect(registerBody).toContain('applySuggestedPassword');
    // Explicit selection fills both fields (random passwords cannot be retyped),
    // then validation runs on both — confirmation can never stay stale-valid.
    expect(registerBody).toContain("setValue('password', suggestion");
    expect(registerBody).toContain("setValue('confirm', suggestion");
  });

  it('never gates submission on the estimator score (backend stays authoritative)', () => {
    expect(registerBody).not.toMatch(/score\s*<\s*[0-9]/);
    expect(registerBody).not.toContain('isStrong');
    expect(registerBody).toContain('PASSWORD_REQUIREMENTS_TEXT');
  });

  it('code-splits the meter so the login bundle never loads the estimator', () => {
    expect(formsSrc).toContain("dynamic(");
    expect(formsSrc).toContain("import('./PasswordStrengthMeter')");
    expect(formsSrc).toContain('ssr: false');
    expect(loginBody).not.toContain('<PasswordStrengthMeter');
  });
});

describe('login non-interference contract', () => {
  it('does not analyse, gate, or confirm login passwords', () => {
    expect(loginBody).not.toContain('PasswordStrengthMeter');
    expect(loginBody).not.toContain('zxcvbn');
    expect(loginBody).not.toMatch(/name="confirm"/);
    expect(loginBody).toContain("'/auth/login'");
    expect(loginBody).toContain('autoComplete="current-password"');
  });
});

describe('password-change integration contract', () => {
  it('reuses the shared meter and suggestion rule on /account/security', () => {
    expect(securitySrc).toContain('<PasswordStrengthMeter');
    expect(securitySrc).toContain('applySuggestedPassword');
    expect(securitySrc).toContain('newPassword: suggestion, confirmPassword: suggestion');
  });

  it('still requires and submits the current password (backend verifies it)', () => {
    expect(securitySrc).toContain('currentPassword: passwordForm.currentPassword');
    expect(securitySrc).toContain('autoComplete="current-password"');
    expect(securitySrc).toContain('autoComplete="new-password"');
  });
});

describe('suggestion defaults', () => {
  it('requests three backend-compatible candidates', () => {
    expect(SUGGESTION_COUNT).toBe(3);
    expect(SUGGESTION_LENGTH).toBeGreaterThanOrEqual(8);
    expect(SUGGESTION_LENGTH).toBeLessThanOrEqual(128);
  });
});
