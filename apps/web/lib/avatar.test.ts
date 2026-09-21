import { describe, expect, it } from 'vitest';

import { getAvatarMenuLabel, getDisplayName, getInitials } from './avatar';

describe('getInitials', () => {
  it('combines first and last name', () => {
    expect(getInitials({ firstName: 'Mark', lastName: 'Kinyanjui' })).toBe('MK');
  });

  it('falls back to a single letter for one-word names', () => {
    expect(getInitials({ firstName: 'Mark', lastName: '' })).toBe('M');
    expect(getInitials({ firstName: '', lastName: 'Kinyanjui' })).toBe('K');
  });

  it('falls back to the email local part when names are missing', () => {
    expect(getInitials({ email: 'gitau@gmail.com' })).toBe('G');
  });

  it('never returns an empty string', () => {
    expect(getInitials({})).toBe('?');
    expect(getInitials({ firstName: '  ', email: '  ' })).toBe('?');
  });

  it('trims whitespace and uppercases', () => {
    expect(getInitials({ firstName: '  mark ', lastName: ' kinyanjui ' })).toBe('MK');
  });
});

describe('getDisplayName', () => {
  it('prefers the full name', () => {
    expect(getDisplayName({ firstName: 'Mark', lastName: 'Kinyanjui' })).toBe('Mark Kinyanjui');
  });

  it('falls back to the email local part, never private data', () => {
    expect(getDisplayName({ email: 'gitau@gmail.com' })).toBe('gitau');
    expect(getDisplayName({})).toBe('My account');
  });
});

describe('getAvatarMenuLabel', () => {
  it('names the user without sensitive data', () => {
    const label = getAvatarMenuLabel({ firstName: 'Mark', lastName: 'Kinyanjui' });
    expect(label).toContain('Mark Kinyanjui');
    expect(label).not.toMatch(/password|token|session|hash/i);
  });
});
