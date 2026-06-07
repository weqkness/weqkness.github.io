export type NumericValue = number | {
  mantissa: number;
  exponent: number;
};

export interface MarkEffectCurve {
  maxMultiplier: NumericValue;
  hardCapCopies: NumericValue;
  curveExponent: number;
}

export interface MarkRollable {
  id: string;
  name: string;
  tier: number;
  gradientId?: string;
  rarityText: string;
  cumulativeDenominator: number;
  baseCumulativeChanceAtLuck1: number;
  baseExclusiveDropChanceAtLuck1: number;
  isSecret: boolean;
  isHidden: boolean;
  ignoreMarksBoost: boolean;
  showInBillboard: boolean;
  showInMarksGuiWhenUnowned: boolean;
  costPerBaseOpen: number;
  costCurrency: string;
  requiredAmount: NumericValue | null;
  requiredAmountSourceNote?: string;
  effects: Record<string, number>;
  effectCaps: Record<string, NumericValue>;
  effectCurves?: Record<string, MarkEffectCurve>;
}

export interface MarkCategory {
  id: string;
  markId: string;
  displayName: string;
  category: string;
  currencyField: string;
  costCurrencyName: string;
  baseCostPerOpen: number;
  baseOpenIntervalSeconds: number;
  rollMode: string;
  buttonAccentHex: string | null;
  rollables: MarkRollable[];
}

export interface MarksData {
  generatedOn: string;
  generatedFrom: string;
  normalCategoryCount: number;
  notes: string[];
  formulas: Record<string, string>;
  categories: MarkCategory[];
}

export type Scales = Record<string, number>;
