'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { getSearchSuggestions } from '../lib/catalog';

/** Global search: prominent input, suggestions, clear, keyboard support, URL state. */
export function SearchBar({ initialQuery = '', autoFocus = false }: { initialQuery?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const suggestions = getSearchSuggestions(value);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function submit(query: string) {
    const q = query.trim();
    setFocused(false);
    router.push(q ? (`/search?q=${encodeURIComponent(q)}` as never) : ('/search' as never));
  }

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="search-field" ref={boxRef}>
      <form
        method="get"
        action="/search"
        className="search-form"
        role="search"
        style={{ flex: 1, marginBottom: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <input
          name="q"
          value={value}
          autoFocus={autoFocus}
          placeholder="Search fashion, footwear, kitchen & home…"
          aria-label="Search products"
          aria-expanded={showSuggestions}
          aria-controls="search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `suggest-${activeIndex}` : undefined}
          role="combobox"
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setFocused(false);
            } else if (e.key === 'ArrowDown' && suggestions.length) {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp' && suggestions.length) {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
              e.preventDefault();
              const target = suggestions[activeIndex];
              setFocused(false);
              router.push(target.href as never);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="button button--secondary button--small"
            aria-label="Clear search"
            onClick={() => setValue('')}
          >
            ✕
          </button>
        ) : null}
        <button type="submit" className="button">Search</button>
      </form>
      {showSuggestions ? (
        <ul className="search-suggest" id="search-suggestions" role="listbox" aria-label="Search suggestions">
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.type}-${suggestion.label}`} role="option" aria-selected={index === activeIndex} id={`suggest-${index}`}>
              <a
                href={suggestion.href}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={(e) => {
                  e.preventDefault();
                  setFocused(false);
                  router.push(suggestion.href as never);
                }}
                style={index === activeIndex ? { background: 'var(--jb-primary-soft)', color: 'var(--jb-primary)' } : undefined}
              >
                <span className="search-suggest__type">{suggestion.type}</span>
                {suggestion.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
