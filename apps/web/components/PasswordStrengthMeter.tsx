'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  SUGGESTION_COUNT,
  analyzeStrength,
  copyPasswordToClipboard,
  loadStrengthEstimator,
  suggestPasswords,
  type PasswordStrengthResult,
  type PasswordSuggestion,
  type StrengthChecker,
} from '../lib/password-strength';
import { JBIcon } from './JBIcons';

/**
 * Reusable password-strength meter + strong-password suggestions (JB tokens,
 * light/dark/system themes via CSS variables).
 *
 * - The estimator loads lazily on first non-empty input and runs locally; the
 *   meter shell renders in a neutral state while empty so the form never shifts.
 * - Screen readers get score-change announcements only (not per-keystroke noise)
 *   plus a labelled `progressbar` with text value.
 * - Suggestions are cryptographically generated candidates evaluated by the
 *   estimator; selecting one calls `onUseSuggestion` — the parent owns the
 *   form-state rule for applying it (see RegisterForm / SecurityPage).
 * - Suggestion state is local only: never persisted, never logged, gone on unmount.
 */
export function PasswordStrengthMeter({
  password,
  userInputs = [],
  onUseSuggestion,
}: {
  password: string;
  userInputs?: string[];
  onUseSuggestion?: (password: string) => void;
}) {
  const reactId = useId();
  const meterId = `pw-strength-${reactId}`;
  const liveId = `${meterId}-live`;
  const detailsId = `${meterId}-details`;
  const suggestionsId = `${meterId}-suggestions`;

  const estimatorRef = useRef<StrengthChecker | null>(null);
  const mountedRef = useRef(true);
  const announcedScoreRef = useRef<number | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const [result, setResult] = useState<PasswordStrengthResult>(() => analyzeStrength('', null));
  const [announcement, setAnnouncement] = useState('');
  const [estimatorFailed, setEstimatorFailed] = useState(false);

  type SuggestionPhase = 'idle' | 'loading' | 'ready' | 'error';
  const [phase, setPhase] = useState<SuggestionPhase>('idle');
  const [suggestions, setSuggestions] = useState<PasswordSuggestion[]>([]);
  const [targetMet, setTargetMet] = useState(true);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!password) {
      announcedScoreRef.current = null;
      setAnnouncement('');
      setResult(analyzeStrength('', null));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!estimatorRef.current) estimatorRef.current = await loadStrengthEstimator();
        if (cancelled || !mountedRef.current) return;
        const inputs = userInputs.map((v) => v.trim()).filter(Boolean);
        const next = analyzeStrength(password, estimatorRef.current.check(password.slice(0, 256), inputs));
        setResult(next);
        setEstimatorFailed(false);
        if (announcedScoreRef.current !== next.score) {
          announcedScoreRef.current = next.score;
          setAnnouncement(`Password strength: ${next.label}. ${next.warning ?? ''}`.trim());
        }
      } catch {
        if (cancelled || !mountedRef.current) return;
        setResult(analyzeStrength(password, null));
        setEstimatorFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Stringify userInputs so unrelated parent re-renders don't re-analyse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, userInputs.join('\u0000')]);

  async function handleSuggest() {
    setPhase('loading');
    setCopyMessage(null);
    try {
      const outcome = await suggestPasswords();
      if (!mountedRef.current) return;
      setSuggestions(outcome.suggestions);
      setTargetMet(outcome.targetMet);
      setPhase(outcome.suggestions.length > 0 ? 'ready' : 'error');
    } catch {
      if (!mountedRef.current) return;
      setPhase('error');
    }
  }

  async function handleCopy(candidate: string) {
    const ok = await copyPasswordToClipboard(candidate);
    if (!mountedRef.current) return;
    setCopyMessage(ok ? 'Password copied. Paste it somewhere safe, like a password manager.' : 'Copy failed. Select the password text manually to copy it.');
    if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      if (mountedRef.current) setCopyMessage(null);
    }, 6000);
  }

  const showMeter = result.state === 'ready';
  const segments = [0, 1, 2, 3, 4];

  return (
    <div className="pw-strength" id={meterId}>
      <div className="pw-strength__head">
        <span className="pw-strength__label">Password strength</span>
        <span className="pw-strength__value" data-score={showMeter ? result.score : undefined}>
          {showMeter ? result.label : password ? 'Checking…' : 'Enter a password'}
        </span>
      </div>
      <div
        className="pw-meter"
        role="progressbar"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={showMeter ? result.score : 0}
        aria-valuetext={showMeter ? result.label : 'No password entered'}
      >
        {segments.map((segment) => (
          <span
            key={segment}
            className="pw-meter__segment"
            data-filled={showMeter && segment <= result.score ? 'true' : 'false'}
            data-score={showMeter ? result.score : undefined}
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="visually-hidden" role="status" id={liveId}>
        {announcement}
      </p>

      {estimatorFailed ? (
        <p className="auth-hint">Strength analysis is unavailable right now. Your password still needs at least 8 characters.</p>
      ) : null}

      {showMeter && (result.warning || result.advice.length > 0) ? (
        <div className="pw-strength__feedback">
          {result.warning ? <p className="pw-strength__warning">{result.warning}</p> : null}
          {result.advice.map((tip) => (
            <p className="auth-hint" key={tip}>
              {tip}
            </p>
          ))}
          {result.crackTimeDisplay ? (
            <details className="pw-strength__details">
              <summary>Why is this password rated {result.label.toLowerCase()}?</summary>
              <p id={detailsId}>
                An attacker guessing offline would need about {result.crackTimeDisplay}. This is a
                model-based approximation — real attacks depend on their methods and resources.
              </p>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="pw-suggest">
        <button type="button" className="text-button pw-suggest__toggle" onClick={handleSuggest} disabled={phase === 'loading'}>
          {phase === 'loading' ? 'Finding strong passwords…' : phase === 'ready' ? 'Suggest different passwords' : 'Suggest a strong password'}
        </button>
        {phase === 'loading' ? (
          <p className="auth-hint" role="status">
            Generating secure random candidates…
          </p>
        ) : null}
        {phase === 'error' ? (
          <p className="auth-field-error" role="alert">
            Could not generate suggestions right now. Try again, or create your own password with several unrelated words.
          </p>
        ) : null}
        {phase === 'ready' ? (
          <div className="pw-suggest__panel" id={suggestionsId} aria-label="Suggested strong passwords">
            {!targetMet ? (
              <p className="auth-hint">
                These are the strongest candidates found — you can generate new ones or pick one and improve it.
              </p>
            ) : null}
            <ul className="pw-suggest__list">
              {suggestions.slice(0, SUGGESTION_COUNT).map((suggestion) => (
                <li key={suggestion.password} className="pw-suggest__item">
                  <span className="pw-suggest__candidate">
                    <code>{suggestion.password}</code>
                    <span className="pw-suggest__score" data-score={suggestion.score}>
                      {suggestion.label}
                    </span>
                  </span>
                  <span className="pw-suggest__actions">
                    {onUseSuggestion ? (
                      <button
                        type="button"
                        className="button button--small"
                        onClick={() => onUseSuggestion(suggestion.password)}
                      >
                        Use this password
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => handleCopy(suggestion.password)}
                      aria-label="Copy suggested password"
                    >
                      <JBIcon name="clipboard" size={16} />
                      Copy
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {copyMessage ? (
              <p className="auth-hint" role="status">
                {copyMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
