import { describe, expect, it } from 'vitest';
import {
  buildExclusiveProbabilities,
  buildScaleUtils,
  calculateMarkEstimate,
  calculateMarksPerSecond,
  calculateMilestoneEffect,
  calculateMilestoneEtaSeconds,
  calculateMilestoneOpensForTier,
  calculateMilestoneTotalOpens,
  findNextUnderHour,
  formatScaled,
  normalizeMilestoneLevel,
  parseScaled,
  processMarks
} from './rune-core';
import type { MarkCategory, Scales } from '../types';

const testScales: Scales = {
  '': 1,
  k: 1000,
  K: 1000,
  M: 1000000,
  B: 1000000000,
  T: 1000000000000
};

const testCategory: MarkCategory = {
  id: 'Insight',
  markId: 'MarkOfInsight',
  displayName: 'Mark of Insight',
  category: 'Normal',
  currencyField: 'Insight',
  costCurrencyName: 'Insight',
  baseCostPerOpen: 250,
  baseOpenIntervalSeconds: 0.5,
  rollMode: 'CumulativeDenominator',
  buttonAccentHex: null,
  rollables: [
    {
      id: 'dim',
      name: 'Dim',
      tier: 1,
      rarityText: '1/1',
      cumulativeDenominator: 1,
      baseCumulativeChanceAtLuck1: 1,
      baseExclusiveDropChanceAtLuck1: 0.9,
      isSecret: false,
      isHidden: false,
      ignoreMarksBoost: false,
      showInBillboard: true,
      showInMarksGuiWhenUnowned: true,
      costPerBaseOpen: 250,
      costCurrency: 'Insight',
      requiredAmount: null,
      effects: { BreakthroughLuckPerCopy: 0.001 },
      effectCaps: { BreakthroughLuckPerCopy: 100 }
    },
    {
      id: 'bright',
      name: 'Bright',
      tier: 2,
      rarityText: '1/10',
      cumulativeDenominator: 10,
      baseCumulativeChanceAtLuck1: 0.1,
      baseExclusiveDropChanceAtLuck1: 0.09,
      isSecret: false,
      isHidden: false,
      ignoreMarksBoost: false,
      showInBillboard: true,
      showInMarksGuiWhenUnowned: true,
      costPerBaseOpen: 250,
      costCurrency: 'Insight',
      requiredAmount: null,
      effects: { MarkSpeedPerCopy: 0.1 },
      effectCaps: { MarkSpeedPerCopy: 10 }
    },
    {
      id: 'secret',
      name: 'Secret',
      tier: 3,
      rarityText: '1/100',
      cumulativeDenominator: 100,
      baseCumulativeChanceAtLuck1: 0.01,
      baseExclusiveDropChanceAtLuck1: 0.01,
      isSecret: false,
      isHidden: true,
      ignoreMarksBoost: false,
      showInBillboard: false,
      showInMarksGuiWhenUnowned: false,
      costPerBaseOpen: 250,
      costCurrency: 'Insight',
      requiredAmount: null,
      effects: { MarkCloneFlatAddPerCopy: 1 },
      effectCaps: { MarkCloneFlatAddPerCopy: 1 }
    }
  ]
};

describe('buildScaleUtils', () => {
  it('builds scale utilities and detects ambiguous suffixes', () => {
    const su = buildScaleUtils(testScales);

    expect(su.scaleEntries).toContainEqual(['Qid', 1e48]);
    expect(su.scaleEntries).toContainEqual(['Qnd', 1e48]);
    expect(su.scaleEntries).toContainEqual(['Tvg', 1e72]);
    expect(su.scaleEntries).toContainEqual(['K', 1000]);
    expect(su.conflictingLowerCaseSuffixes.has('k')).toBe(true);
  });
});

describe('parseScaled', () => {
  const su = buildScaleUtils(testScales);

  it('parses raw, scientific, and suffix values', () => {
    expect(parseScaled('123', su)).toEqual({ value: 123, warning: null });
    expect(parseScaled('1.5E6', su)).toEqual({ value: 1500000, warning: null });
    expect(parseScaled('499.99T', su)).toEqual({ value: 499.99e12, warning: null });
    expect(parseScaled('1Qid', su).value).toBe(1e48);
    expect(parseScaled('1Qnd', su).value).toBe(1e48);
    expect(parseScaled('1SxDe', su).value).toBe(1e54);
    expect(parseScaled('59.44Tvg', su).value).toBe(59.44e72);
  });

  it('warns for ambiguous suffixes', () => {
    const result = parseScaled('1k', su);
    expect(result.value).toBe(1000);
    expect(result.warning).toContain('Ambiguous suffix');
  });

  it('rejects invalid inputs', () => {
    expect(parseScaled('', su).value).toBe(0);
    expect(parseScaled('abc', su).value).toBe(0);
    expect(parseScaled('1.5x', su).value).toBe(0);
  });
});

describe('formatScaled', () => {
  const su = buildScaleUtils(testScales);

  it('formats small and large values', () => {
    expect(formatScaled(123, su)).toBe('123');
    expect(formatScaled(1200000000, su)).toBe('1.2B');
    expect(formatScaled(1e48, su)).toBe('1Qid');
    expect(formatScaled(59.44e72, su)).toBe('59.44Tvg');
    expect(formatScaled(1.418e84, su)).toBe('1.42Spvg');
    expect(formatScaled(1e123, su)).toBe('1Qag');
  });
});

describe('mark probability math', () => {
  it('uses provided base exclusive chances at Mark Luck 1', () => {
    const probabilities = buildExclusiveProbabilities(testCategory, 1);

    expect(probabilities.get('dim')).toBe(0.9);
    expect(probabilities.get('bright')).toBe(0.09);
    expect(probabilities.get('secret')).toBe(0.01);
  });

  it('recomputes exclusive tier probabilities from cumulative denominators at higher luck', () => {
    const probabilities = buildExclusiveProbabilities(testCategory, 10);

    expect(probabilities.get('dim')).toBe(0);
    expect(probabilities.get('bright')).toBe(0.9);
    expect(probabilities.get('secret')).toBe(0.1);
  });

  it('calculates marks per second from speed and bulk', () => {
    expect(calculateMarksPerSecond(2, 3, 0.5)).toBe(6);
    expect(calculateMarksPerSecond(0, 3, 0.5)).toBe(0);
  });

  it('matches the game opens per second display for high scaled stats', () => {
    const su = buildScaleUtils(testScales);
    const markSpeed = parseScaled('58.29Sp', su).value;
    const markBulk = parseScaled('12.67Qid', su).value;

    expect(formatScaled(calculateMarksPerSecond(markSpeed, markBulk, 0.5), su)).toBe('738.53Tvg');
  });

  it('calculates target ETA with clone amplification', () => {
    const estimate = calculateMarkEstimate(
      testCategory,
      testCategory.rollables[1],
      1,
      1,
      1,
      2,
      4
    );

    expect(estimate.marksPerSecond).toBe(1);
    expect(estimate.exclusiveTierProbability).toBe(0.09);
    expect(estimate.expectedCopiesPerHour).toBe(648);
    expect(estimate.secondsForTargetCopies).toBeCloseTo(22.2222);
  });
});

describe('processMarks', () => {
  it('filters hidden marks unless secrets are enabled', () => {
    expect(processMarks([testCategory], 1, 1, 1, 1, 1)).toHaveLength(2);
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { showSecret: true })).toHaveLength(3);
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { secretFilter: 'secret' })).toHaveLength(1);
  });

  it('filters marks with zero calculated chance', () => {
    const zeroChanceCategory: MarkCategory = {
      ...testCategory,
      rollables: [
        ...testCategory.rollables,
        {
          ...testCategory.rollables[1],
          id: 'impossible',
          name: 'Impossible',
          baseExclusiveDropChanceAtLuck1: 0
        }
      ]
    };

    const processed = processMarks([zeroChanceCategory], 1, 1, 1, 1, 1, { showSecret: true });

    expect(processed.map(mark => mark.id)).not.toContain('impossible');
  });

  it('filters by text, tier, category, and effect type', () => {
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { text: 'bright' })[0].id).toBe('bright');
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { tier: 2 })[0].id).toBe('bright');
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { categoryId: 'Insight' })).toHaveLength(2);
    expect(processMarks([testCategory], 1, 1, 1, 1, 1, { effectType: 'MarkSpeedPerCopy' })[0].id).toBe('bright');
  });

  it('sorts by target ETA', () => {
    const asc = processMarks([testCategory], 1, 1, 1, 1, 1, { sort: 'asc' });
    const desc = processMarks([testCategory], 1, 1, 1, 1, 1, { sort: 'desc' });

    expect(asc[0].id).toBe('dim');
    expect(desc[0].id).toBe('bright');
  });
});

describe('findNextUnderHour', () => {
  it('finds the first non-instant target under an hour', () => {
    const processed = processMarks([testCategory], 1, 1, 1, 1, 1, { sort: 'asc' });
    expect(findNextUnderHour(processed)).toBe('dim');
  });

  it('returns null if no visible mark fits the window', () => {
    const processed = processMarks([testCategory], 1e9, 1, 1, 1, 1);
    expect(findNextUnderHour(processed)).toBeNull();
  });
});

describe('milestone math', () => {
  it('normalizes milestone levels to completed integer levels', () => {
    expect(normalizeMilestoneLevel(-1)).toBe(0);
    expect(normalizeMilestoneLevel(2.9)).toBe(2);
    expect(normalizeMilestoneLevel(Number.NaN)).toBe(0);
  });

  it('calculates per-tier opens with 1.45x scaling rounded to nearest integer', () => {
    expect(calculateMilestoneOpensForTier(1)).toBe(10000);
    expect(calculateMilestoneOpensForTier(2)).toBe(14500);
    expect(calculateMilestoneOpensForTier(3)).toBe(21025);
  });

  it('sums opens from current milestone to target milestone', () => {
    expect(calculateMilestoneTotalOpens(0, 3)).toBe(45525);
    expect(calculateMilestoneTotalOpens(1, 3)).toBe(35525);
    expect(calculateMilestoneTotalOpens(3, 3)).toBe(0);
  });

  it('calculates ETA from player MPS', () => {
    expect(calculateMilestoneEtaSeconds(100, 1, 3)).toBeCloseTo(355.25);
    expect(calculateMilestoneEtaSeconds(0, 1, 3)).toBe(Infinity);
    expect(calculateMilestoneEtaSeconds(100, 3, 3)).toBe(0);
  });

  it('calculates Mark Bulk milestone effect as 1.1^tier', () => {
    expect(calculateMilestoneEffect(0)).toBe(1);
    expect(calculateMilestoneEffect(3)).toBeCloseTo(1.331);
  });
});
