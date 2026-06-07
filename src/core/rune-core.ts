import type { MarkCategory, MarkRollable, NumericValue, Scales } from '../types';

export interface ParseResult {
  value: number;
  warning: string | null;
}

export interface ScaleUtils {
  scaleEntries: Array<[string, number]>;
  lowerCaseScaleMap: Record<string, string[]>;
  conflictingLowerCaseSuffixes: Set<string>;
}

export function buildScaleUtils(scales: Scales): ScaleUtils {
  const scaleEntries = Object.entries(scales)
    .filter(([key]) => key !== '')
    .sort(([, a], [, b]) => b - a);

  const lowerCaseScaleMap: Record<string, string[]> = {};
  const conflictingLowerCaseSuffixes = new Set<string>();

  for (const [suffix] of scaleEntries) {
    const lower = suffix.toLowerCase();
    lowerCaseScaleMap[lower] ??= [];
    lowerCaseScaleMap[lower].push(suffix);

    if (lowerCaseScaleMap[lower].length > 1) {
      conflictingLowerCaseSuffixes.add(lower);
    }
  }

  return {
    scaleEntries: [['', 1], ...scaleEntries],
    lowerCaseScaleMap,
    conflictingLowerCaseSuffixes
  };
}

export function parseScaled(input: string, su: ScaleUtils): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: 0, warning: 'Empty input' };
  }

  if (trimmed.includes('e') || trimmed.includes('E')) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return { value: 0, warning: 'Invalid scientific notation' };
    }
    return { value: num, warning: null };
  }

  let numPart = trimmed;
  let suffix = '';
  let multiplier = 1;

  for (const [scaleSuffix, scaleMultiplier] of su.scaleEntries) {
    if (scaleSuffix && trimmed.toLowerCase().endsWith(scaleSuffix.toLowerCase())) {
      const potentialNumPart = trimmed.slice(0, -scaleSuffix.length);
      const num = Number(potentialNumPart);

      if (Number.isFinite(num)) {
        numPart = potentialNumPart;
        suffix = scaleSuffix;
        multiplier = scaleMultiplier;
        break;
      }
    }
  }

  if (suffix === '') {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return { value: 0, warning: 'Invalid number format' };
    }
    return { value: num, warning: null };
  }

  const baseNum = Number(numPart);
  if (!Number.isFinite(baseNum)) {
    return { value: 0, warning: 'Invalid number part before suffix' };
  }

  const result = baseNum * multiplier;
  if (!Number.isFinite(result)) {
    return { value: 0, warning: 'Result too large' };
  }

  const lowerSuffix = suffix.toLowerCase();
  let warning: string | null = null;

  if (su.conflictingLowerCaseSuffixes.has(lowerSuffix)) {
    const alternatives = su.lowerCaseScaleMap[lowerSuffix].filter(s => s !== suffix);
    if (alternatives.length > 0) {
      warning = `Ambiguous suffix "${suffix}" - could also mean: ${alternatives.join(', ')}`;
    }
  }

  return { value: result, warning };
}

export function formatScaled(num: number, su: ScaleUtils): string {
  if (!Number.isFinite(num) || num === 0) {
    return num.toString();
  }

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum < 1000) {
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  for (const [suffix, multiplier] of su.scaleEntries) {
    if (suffix && absNum >= multiplier) {
      const scaled = absNum / multiplier;
      if (scaled < 1000) {
        return `${sign}${scaled.toPrecision(3)} ${suffix}`;
      }
    }
  }

  return num.toExponential(3);
}

export function formatNumericValue(value: NumericValue | null | undefined, su: ScaleUtils): string {
  if (value == null) {
    return 'None';
  }

  if (typeof value === 'number') {
    return formatScaled(value, su);
  }

  return `${value.mantissa.toPrecision(3)}e${value.exponent}`;
}

export function isSecretMark(mark: MarkRollable): boolean {
  return mark.isSecret || mark.isHidden;
}

export function calculateMarksPerSecond(
  markSpeed: number,
  markBulk: number,
  baseOpenIntervalSeconds: number
): number {
  if (markSpeed <= 0 || markBulk <= 0 || baseOpenIntervalSeconds <= 0) {
    return 0;
  }

  return (markSpeed / baseOpenIntervalSeconds) * markBulk;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function thresholdChance(markLuck: number, denominator: number): number {
  if (markLuck <= 0 || denominator <= 0) {
    return 0;
  }

  return clamp(markLuck / denominator, 0, 1);
}

export function buildExclusiveProbabilities(category: MarkCategory, markLuck: number): Map<string, number> {
  const sorted = [...category.rollables].sort((a, b) => a.tier - b.tier);
  const probabilities = new Map<string, number>();

  if (markLuck === 1) {
    for (const mark of sorted) {
      probabilities.set(mark.id, mark.baseExclusiveDropChanceAtLuck1);
    }
    return probabilities;
  }

  for (let index = 0; index < sorted.length; index += 1) {
    const mark = sorted[index];
    const next = sorted[index + 1];
    const currentThreshold = mark.tier <= 1 ? 1 : thresholdChance(markLuck, mark.cumulativeDenominator);
    const nextThreshold = next ? thresholdChance(markLuck, next.cumulativeDenominator) : 0;

    const probability = mark.tier <= 1
      ? 1 - nextThreshold
      : currentThreshold - nextThreshold;

    probabilities.set(mark.id, clamp(probability, 0, 1));
  }

  return probabilities;
}

export interface MarkEstimate {
  exclusiveTierProbability: number;
  marksPerSecond: number;
  expectedCopiesPerHour: number;
  secondsForFirstBaseDrop: number;
  secondsForTargetCopies: number;
}

export function calculateMarkEstimate(
  category: MarkCategory,
  mark: MarkRollable,
  markSpeed: number,
  markBulk: number,
  markLuck: number,
  markClone: number,
  targetCopies: number
): MarkEstimate {
  const probabilities = buildExclusiveProbabilities(category, markLuck);
  const exclusiveTierProbability = probabilities.get(mark.id) ?? 0;
  const marksPerSecond = calculateMarksPerSecond(
    markSpeed,
    markBulk,
    category.baseOpenIntervalSeconds
  );
  const expectedBaseDropsPerSecond = marksPerSecond * exclusiveTierProbability;
  const expectedCopiesPerSecond = expectedBaseDropsPerSecond * Math.max(markClone, 0);
  const safeTargetCopies = Math.max(targetCopies, 0);

  return {
    exclusiveTierProbability,
    marksPerSecond,
    expectedCopiesPerHour: expectedCopiesPerSecond * 3600,
    secondsForFirstBaseDrop: expectedBaseDropsPerSecond > 0
      ? 1 / expectedBaseDropsPerSecond
      : Infinity,
    secondsForTargetCopies: expectedCopiesPerSecond > 0
      ? safeTargetCopies / expectedCopiesPerSecond
      : Infinity
  };
}

export interface ProcessOptions {
  text?: string;
  categoryId?: string;
  tier?: number | 'all';
  secretFilter?: 'all' | 'secret' | 'nonSecret';
  effectType?: string;
  showSecret?: boolean;
  hideInstant?: boolean;
  sort?: 'asc' | 'desc';
}

export interface ProcessedMark extends MarkRollable {
  categoryId: string;
  categoryName: string;
  baseOpenIntervalSeconds: number;
  isSecret: boolean;
  estimate: MarkEstimate;
}

export function processMarks(
  categories: MarkCategory[],
  markSpeed: number,
  markBulk: number,
  markLuck: number,
  markClone: number,
  targetCopies: number,
  opts: ProcessOptions = {}
): ProcessedMark[] {
  let processed = categories.flatMap(category =>
    category.rollables.map((mark): ProcessedMark => ({
      ...mark,
      categoryId: category.id,
      categoryName: category.displayName,
      baseOpenIntervalSeconds: category.baseOpenIntervalSeconds,
      isSecret: isSecretMark(mark),
      estimate: calculateMarkEstimate(
        category,
        mark,
        markSpeed,
        markBulk,
        markLuck,
        markClone,
        targetCopies
      )
    }))
  );

  if (!opts.showSecret && opts.secretFilter !== 'secret') {
    processed = processed.filter(mark => !mark.isSecret);
  }

  if (opts.text) {
    const searchText = opts.text.toLowerCase();
    processed = processed.filter(mark =>
      mark.name.toLowerCase().includes(searchText) ||
      mark.id.toLowerCase().includes(searchText) ||
      mark.categoryName.toLowerCase().includes(searchText)
    );
  }

  if (opts.categoryId && opts.categoryId !== 'all') {
    processed = processed.filter(mark => mark.categoryId === opts.categoryId);
  }

  if (opts.tier && opts.tier !== 'all') {
    processed = processed.filter(mark => mark.tier === opts.tier);
  }

  if (opts.secretFilter === 'secret') {
    processed = processed.filter(mark => mark.isSecret);
  } else if (opts.secretFilter === 'nonSecret') {
    processed = processed.filter(mark => !mark.isSecret);
  }

  if (opts.effectType && opts.effectType !== 'all') {
    processed = processed.filter(mark => opts.effectType && mark.effects[opts.effectType] !== undefined);
  }

  if (opts.hideInstant) {
    processed = processed.filter(mark => mark.estimate.secondsForTargetCopies >= 1);
  }

  if (opts.sort) {
    processed.sort((a, b) => {
      const timeA = a.estimate.secondsForTargetCopies;
      const timeB = b.estimate.secondsForTargetCopies;
      return opts.sort === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }

  return processed;
}

export function findNextUnderHour(processed: ProcessedMark[]): string | null {
  const candidate = processed.find(mark =>
    mark.estimate.secondsForTargetCopies >= 1 &&
    mark.estimate.secondsForTargetCopies < 3600
  );

  return candidate?.id ?? null;
}
