import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RuneCalculatorPanel from './RuneCalculatorPanel';
import type { MarksData, Scales } from '../../types';

const testScales: Scales = {
  '': 1,
  K: 1000,
  M: 1000000,
  B: 1000000000
};

const testMarksData: MarksData = {
  generatedOn: '2026-06-07',
  generatedFrom: 'test',
  normalCategoryCount: 1,
  notes: [],
  formulas: {},
  categories: [
    {
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
          id: 'DimFlicker',
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
          id: 'RevengeSigil',
          name: 'Revenge',
          tier: 2,
          rarityText: '1/10',
          cumulativeDenominator: 10,
          baseCumulativeChanceAtLuck1: 0.1,
          baseExclusiveDropChanceAtLuck1: 0.1,
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
    }
  ]
};

beforeEach(() => {
  localStorage.clear();
});

describe('RuneCalculatorPanel', () => {
  it('renders the Mark calculator with default inputs', () => {
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    expect(screen.getByRole('heading', { name: 'Mark Rune Calculator' })).toBeInTheDocument();
    expect(screen.getByText('Immortality Incremental')).toBeInTheDocument();
    expect(screen.getByLabelText(/Mark Speed/)).toHaveValue('1');
    expect(screen.getByLabelText(/Mark Bulk/)).toHaveValue('1');
    expect(screen.getByLabelText(/Mark Luck/)).toHaveValue('1');
    expect(screen.getByLabelText(/Mark Clone/)).toHaveValue('1');
  });

  it('shows a validation message for invalid calculator inputs', async () => {
    const user = userEvent.setup();
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    const speedInput = screen.getByLabelText(/Mark Speed/);
    await user.clear(speedInput);
    await user.type(speedInput, '0');

    expect(await screen.findByText(/must all be greater than 0/)).toBeInTheDocument();
  });

  it('filters marks by search text', async () => {
    const user = userEvent.setup();
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    expect(screen.getAllByText('Dim').length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText('Search'), 'revenge');

    await waitFor(() => {
      expect(screen.queryByText('Dim')).not.toBeInTheDocument();
      expect(screen.getByText(/No marks match/)).toBeInTheDocument();
    });
  });

  it('treats hidden marks as secret marks behind the Show Secret Marks toggle', async () => {
    const user = userEvent.setup();
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    expect(screen.queryByText('Revenge')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Show Secret Marks/ }));

    expect((await screen.findAllByText('Revenge')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Secret').length).toBeGreaterThan(1);
  });

  it('calculates ETA, chance, and copies per hour from Mark settings', async () => {
    const user = userEvent.setup();
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    await user.click(screen.getByRole('checkbox', { name: /Show Secret Marks/ }));

    expect((await screen.findAllByText('10 seconds')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10.00%/).length).toBeGreaterThan(0);
    expect(screen.getByText('360')).toBeInTheDocument();
  });

  it('filters by effect type', async () => {
    const user = userEvent.setup();
    render(<RuneCalculatorPanel marksData={testMarksData} scales={testScales} />);

    expect(screen.getAllByText(/Breakthrough Luck/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/BreakthroughLuckPerCopy/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Effect'), 'BreakthroughLuckPerCopy');

    expect(screen.getAllByText('Dim').length).toBeGreaterThan(0);
    expect(screen.queryByText('Revenge')).not.toBeInTheDocument();
  });
});
