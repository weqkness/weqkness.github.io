import { describe, expect, it } from 'vitest';
import { formatTimeHuman } from './formatters';

describe('formatTimeHuman', () => {
  it('formats instant times', () => {
    expect(formatTimeHuman(0.5)).toBe('Instant');
    expect(formatTimeHuman(0)).toBe('Instant');
  });

  it('formats seconds', () => {
    expect(formatTimeHuman(45)).toBe('45 seconds');
    expect(formatTimeHuman(1)).toBe('1 second');
  });

  it('formats minutes and seconds', () => {
    expect(formatTimeHuman(90)).toBe('1 minute, 30 seconds');
    expect(formatTimeHuman(125)).toBe('2 minutes, 5 seconds');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTimeHuman(3665)).toBe('1 hour, 1 minute, 5 seconds');
    expect(formatTimeHuman(7325)).toBe('2 hours, 2 minutes, 5 seconds');
  });

  it('formats complex times with up to 3 units', () => {
    const oneDay = 24 * 60 * 60;
    expect(formatTimeHuman(oneDay + 3665)).toBe('1 day, 1 hour, 1 minute');
  });

  it('handles infinite values', () => {
    expect(formatTimeHuman(Infinity)).toBe('Never');
    expect(formatTimeHuman(-Infinity)).toBe('Never');
  });

  it('handles absurdly large values', () => {
    expect(formatTimeHuman(1e30)).toBe('...');
  });
});
