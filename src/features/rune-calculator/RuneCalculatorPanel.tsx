import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildScaleUtils,
  findNextUnderHour,
  formatNumericValue,
  formatScaled,
  parseScaled,
  processMarks,
  type ProcessOptions,
  type ProcessedMark,
  type ScaleUtils
} from '../../core/rune-core';
import { formatTimeHuman } from '../../lib/formatters';
import type { MarksData, Scales } from '../../types';

const CopyIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 13 4 4L19 7" />
  </svg>
);

const SparkIcon = () => (
  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 9.4 8.9 2 12l7.4 3.1L12 22l2.6-6.9L22 12l-7.4-3.1L12 2Z" />
  </svg>
);

interface Props {
  marksData: MarksData;
  scales: Scales;
  initialMarkSpeed?: string;
  initialMarkBulk?: string;
  initialMarkLuck?: string;
  initialMarkClone?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      // Ignore storage failures.
    }
  };

  return [storedValue, setValue] as const;
}

function positiveInput(value: number): number {
  return value > 0 ? value : 0;
}

function formatProbability(probability: number, su: ScaleUtils): string {
  if (probability <= 0 || !Number.isFinite(probability)) {
    return '0%';
  }

  const oneIn = 1 / probability;
  const percent = probability >= 0.0001
    ? `${(probability * 100).toPrecision(4)}%`
    : '<0.0001%';

  return `${percent} (1 / ${formatScaled(oneIn, su)})`;
}

function uniqueEffectTypes(data: MarksData): string[] {
  const effects = new Set<string>();
  for (const category of data.categories) {
    for (const mark of category.rollables) {
      Object.keys(mark.effects ?? {}).forEach(effect => effects.add(effect));
    }
  }
  return [...effects].sort();
}

function formatEffectName(effect: string): string {
  const aliases: Record<string, string> = {
    MarkBulkPerCopy: 'Mark Bulk',
    MarkCloneFlatAddPerCopy: 'Mark Clone',
    MarkLuckPerCopy: 'Mark Luck',
    MarkSpeedPerCopy: 'Mark Speed'
  };

  if (aliases[effect]) {
    return aliases[effect];
  }

  return effect
    .replace(/FlatAddPerCopy$/, '')
    .replace(/PerCopy$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bMultiplier\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function allTiers(data: MarksData): number[] {
  const tiers = new Set<number>();
  for (const category of data.categories) {
    for (const mark of category.rollables) {
      tiers.add(mark.tier);
    }
  }
  return [...tiers].sort((a, b) => a - b);
}

export default function RuneCalculatorPanel({
  marksData,
  scales,
  initialMarkSpeed = '1',
  initialMarkBulk = '1',
  initialMarkLuck = '1',
  initialMarkClone = '1'
}: Props) {
  const [markSpeedInput, setMarkSpeedInput] = useLocalStorage('markCalc_markSpeed', initialMarkSpeed);
  const [markBulkInput, setMarkBulkInput] = useLocalStorage('markCalc_markBulk', initialMarkBulk);
  const [markLuckInput, setMarkLuckInput] = useLocalStorage('markCalc_markLuck', initialMarkLuck);
  const [markCloneInput, setMarkCloneInput] = useLocalStorage('markCalc_markClone', initialMarkClone);
  const [targetCopiesInput, setTargetCopiesInput] = useLocalStorage('markCalc_targetCopies', '1');
  const [filterText, setFilterText] = useLocalStorage('markCalc_filter', '');
  const [categoryId, setCategoryId] = useLocalStorage('markCalc_category', 'all');
  const [tierFilter, setTierFilter] = useLocalStorage('markCalc_tier', 'all');
  const [secretFilter, setSecretFilter] = useLocalStorage<'all' | 'secret' | 'nonSecret'>('markCalc_secretFilter', 'all');
  const [effectType, setEffectType] = useLocalStorage('markCalc_effectType', 'all');
  const [showSecret, setShowSecret] = useLocalStorage('markCalc_showSecret', false);
  const [hideInstant, setHideInstant] = useLocalStorage('markCalc_hideInstant', false);
  const [sortOrder, setSortOrder] = useLocalStorage<'asc' | 'desc'>('markCalc_sort', 'asc');
  const [isDarkMode, setIsDarkMode] = useLocalStorage('markCalc_darkMode', false);
  const [copiedText, setCopiedText] = useState('');

  const debouncedFilterText = useDebounce(filterText, 150);
  const scaleUtils = useMemo(() => buildScaleUtils(scales), [scales]);
  const effectTypes = useMemo(() => uniqueEffectTypes(marksData), [marksData]);
  const tiers = useMemo(() => allTiers(marksData), [marksData]);

  const markSpeed = useMemo(() => parseScaled(markSpeedInput, scaleUtils), [markSpeedInput, scaleUtils]);
  const markBulk = useMemo(() => parseScaled(markBulkInput, scaleUtils), [markBulkInput, scaleUtils]);
  const markLuck = useMemo(() => parseScaled(markLuckInput, scaleUtils), [markLuckInput, scaleUtils]);
  const markClone = useMemo(() => parseScaled(markCloneInput, scaleUtils), [markCloneInput, scaleUtils]);
  const targetCopies = useMemo(() => parseScaled(targetCopiesInput, scaleUtils), [targetCopiesInput, scaleUtils]);

  const processOptions = useMemo((): ProcessOptions => ({
    text: debouncedFilterText,
    categoryId,
    tier: tierFilter === 'all' ? 'all' : Number(tierFilter),
    secretFilter,
    effectType,
    showSecret,
    hideInstant,
    sort: sortOrder
  }), [categoryId, debouncedFilterText, effectType, hideInstant, secretFilter, showSecret, sortOrder, tierFilter]);

  const processedMarks = useMemo(() =>
    processMarks(
      marksData.categories,
      positiveInput(markSpeed.value),
      positiveInput(markBulk.value),
      positiveInput(markLuck.value),
      positiveInput(markClone.value),
      positiveInput(targetCopies.value),
      processOptions
    ),
    [markBulk.value, markClone.value, markLuck.value, markSpeed.value, marksData.categories, processOptions, targetCopies.value]
  );

  const nextTarget = useMemo(() => findNextUnderHour(processedMarks), [processedMarks]);
  const visibleSecrets = processedMarks.filter(mark => mark.isSecret).length;
  const visibleEffects = processedMarks.reduce((count, mark) => count + Object.keys(mark.effects ?? {}).length, 0);
  const hasValidInputs = markSpeed.value > 0 && markBulk.value > 0 && markLuck.value > 0 && markClone.value > 0 && targetCopies.value > 0;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      window.setTimeout(() => setCopiedText(''), 1600);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <main className={`min-h-screen ${isDarkMode ? 'dark' : ''} bg-[radial-gradient(circle_at_50%_0%,#6b2f3c_0%,#2f1e27_42%,#090b13_100%)] text-white`}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b-4 border-black/60 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border-2 border-black bg-cyan-400/90 px-3 py-1 text-sm font-black text-slate-950 shadow-[0_3px_0_#000]">
              <SparkIcon />
              Immortality Incremental
            </div>
            <h1 className="text-3xl font-black tracking-normal text-white drop-shadow-[0_3px_0_#000]">
              Mark Rune Calculator
            </h1>
            <p className="mt-1 text-sm font-semibold text-cyan-100 drop-shadow-[0_2px_0_#000]">
              {marksData.categories.length} categories, {marksData.categories.reduce((total, category) => total + category.rollables.length, 0)} marks. Currency income is ignored by design.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="rounded-md border-2 border-black bg-slate-900/90 px-3 py-2 text-sm font-black text-white shadow-[0_3px_0_#000] hover:bg-cyan-950"
            >
              {isDarkMode ? 'HUD' : 'Glow'}
            </button>
            <a
              href="https://www.roblox.com/"
              className="rounded-md border-2 border-black bg-slate-900/90 px-3 py-2 text-sm font-black text-white shadow-[0_3px_0_#000] hover:bg-cyan-950"
            >
              Roblox
            </a>
          </div>
        </header>

        <section className="mb-5 rounded-lg border-4 border-black bg-slate-950/80 p-4 shadow-[0_6px_0_#000] backdrop-blur">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <NumberInput label="Mark Speed" value={markSpeedInput} onChange={setMarkSpeedInput} result={markSpeed} scaleUtils={scaleUtils} copyLabel="speed" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Bulk" value={markBulkInput} onChange={setMarkBulkInput} result={markBulk} scaleUtils={scaleUtils} copyLabel="bulk" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Luck" value={markLuckInput} onChange={setMarkLuckInput} result={markLuck} scaleUtils={scaleUtils} copyLabel="luck" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Clone" value={markCloneInput} onChange={setMarkCloneInput} result={markClone} scaleUtils={scaleUtils} copyLabel="clone" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Target Copies" value={targetCopiesInput} onChange={setTargetCopiesInput} result={targetCopies} scaleUtils={scaleUtils} copyLabel="target" onCopy={copyToClipboard} copiedText={copiedText} />
          </div>

          {!hasValidInputs && (
            <div className="mt-4 rounded-md border-2 border-black bg-red-950 px-4 py-3 text-sm font-bold text-red-100 shadow-[0_3px_0_#000]">
              Mark Speed, Mark Bulk, Mark Luck, Mark Clone, and Target Copies must all be greater than 0.
            </div>
          )}
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Visible marks" value={processedMarks.length.toString()} />
          <StatTile label="Secret marks" value={visibleSecrets.toString()} />
          <StatTile label="Effects shown" value={visibleEffects.toString()} />
          <StatTile label="Next under 1h" value={nextTarget ? processedMarks.find(mark => mark.id === nextTarget)?.name ?? '-' : '-'} />
        </section>

        <section className="mb-5 rounded-lg border-4 border-black bg-slate-950/80 p-4 shadow-[0_6px_0_#000] backdrop-blur">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Search">
              <input
                type="search"
                value={filterText}
                onChange={event => setFilterText(event.target.value)}
                className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000] placeholder:text-slate-400"
                placeholder="Name, id, category"
              />
            </Field>

            <Field label="Category">
              <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000]">
                <option value="all">All categories</option>
                {marksData.categories.map(category => (
                  <option key={category.id} value={category.id}>{category.displayName}</option>
                ))}
              </select>
            </Field>

            <Field label="Tier">
              <select value={tierFilter} onChange={event => setTierFilter(event.target.value)} className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000]">
                <option value="all">All tiers</option>
                {tiers.map(tier => <option key={tier} value={tier}>Tier {tier}</option>)}
              </select>
            </Field>

            <Field label="Secret">
              <select value={secretFilter} onChange={event => setSecretFilter(event.target.value as 'all' | 'secret' | 'nonSecret')} className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000]">
                <option value="all">All allowed</option>
                <option value="secret">Secret only</option>
                <option value="nonSecret">Non-secret only</option>
              </select>
            </Field>

            <Field label="Effect">
              <select value={effectType} onChange={event => setEffectType(event.target.value)} className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000]">
                <option value="all">All effects</option>
                {effectTypes.map(effect => <option key={effect} value={effect}>{formatEffectName(effect)}</option>)}
              </select>
            </Field>

            <Field label="Sort">
              <select value={sortOrder} onChange={event => setSortOrder(event.target.value as 'asc' | 'desc')} className="w-full rounded-md border-2 border-black bg-slate-900/90 text-sm font-bold text-white shadow-[0_3px_0_#000]">
                <option value="asc">Fastest ETA</option>
                <option value="desc">Slowest ETA</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-5">
            <Checkbox label="Show Secret Marks" checked={showSecret} onChange={setShowSecret} />
            <Checkbox label="Hide instant ETA" checked={hideInstant} onChange={setHideInstant} />
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border-4 border-black bg-slate-950/80 shadow-[0_6px_0_#000] backdrop-blur">
          <div className="border-b-4 border-black bg-slate-900/90 px-4 py-3">
            <h2 className="text-lg font-black text-white drop-shadow-[0_2px_0_#000]">Rune Browser</h2>
          </div>

          <div className="divide-y-4 divide-black/60">
            {processedMarks.map(mark => (
              <MarkRow
                key={`${mark.categoryId}-${mark.id}`}
                mark={mark}
                scaleUtils={scaleUtils}
                isNextTarget={mark.id === nextTarget}
                copiedText={copiedText}
                onCopy={copyToClipboard}
              />
            ))}
          </div>

          {processedMarks.length === 0 && (
            <div className="px-4 py-14 text-center">
              <h3 className="font-black text-white">No marks match the current filters</h3>
              <p className="mt-1 text-sm font-semibold text-cyan-100">Adjust category, tier, effect, or secret settings.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

interface NumberInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  result: { value: number; warning: string | null };
  scaleUtils: ScaleUtils;
  copyLabel: string;
  onCopy: (text: string, label: string) => void;
  copiedText: string;
}

function NumberInput({ label, value, onChange, result, scaleUtils, copyLabel, onCopy, copiedText }: NumberInputProps) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          className="w-full rounded-md border-2 border-black bg-slate-900/90 pr-10 font-mono text-sm font-bold text-white shadow-[0_3px_0_#000] placeholder:text-slate-400"
          placeholder="1, 10K, 1Qid"
        />
        <button
          type="button"
          onClick={() => onCopy(formatScaled(result.value, scaleUtils), copyLabel)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-cyan-200 hover:bg-cyan-900 hover:text-white"
          title={`Copy parsed ${label}`}
        >
          {copiedText === copyLabel ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <div className="mt-2 min-h-5 text-xs font-semibold text-cyan-100">
        Parsed: <span className="font-mono font-medium">{formatScaled(result.value, scaleUtils)}</span>
        {result.warning && <span className="ml-1 text-amber-700 dark:text-amber-300">{result.warning}</span>}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-black text-white drop-shadow-[0_2px_0_#000]">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-bold text-white drop-shadow-[0_2px_0_#000]">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="rounded border-2 border-black bg-slate-900 text-cyan-400 focus:ring-cyan-400"
      />
      {label}
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-4 border-black bg-slate-950/80 p-4 shadow-[0_5px_0_#000]">
      <div className="text-xs font-black uppercase text-cyan-200 drop-shadow-[0_2px_0_#000]">{label}</div>
      <div className="mt-1 truncate text-xl font-black text-white drop-shadow-[0_2px_0_#000]">{value}</div>
    </div>
  );
}

function MarkRow({
  mark,
  scaleUtils,
  isNextTarget,
  copiedText,
  onCopy
}: {
  mark: ProcessedMark;
  scaleUtils: ScaleUtils;
  isNextTarget: boolean;
  copiedText: string;
  onCopy: (text: string, label: string) => void;
}) {
  const chanceText = formatProbability(mark.estimate.exclusiveTierProbability, scaleUtils);
  const copyLabel = `chance-${mark.categoryId}-${mark.id}`;
  const effectEntries = Object.entries(mark.effects ?? {});

  return (
    <article className={`px-4 py-4 transition-colors ${isNextTarget ? 'bg-cyan-950/50' : 'bg-slate-950/35 hover:bg-slate-900/70'}`}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-white drop-shadow-[0_2px_0_#000]">{mark.name}</h3>
            <span className="rounded-md border-2 border-black bg-slate-800 px-2 py-1 text-xs font-black text-white shadow-[0_2px_0_#000]">{mark.categoryName}</span>
            <span className="rounded-md border-2 border-black bg-cyan-400 px-2 py-1 text-xs font-black text-slate-950 shadow-[0_2px_0_#000]">Tier {mark.tier}</span>
            <span className="rounded-md border-2 border-black bg-violet-500 px-2 py-1 text-xs font-black text-white shadow-[0_2px_0_#000]">{mark.rarityText}</span>
            {mark.isSecret && <span className="rounded-md border-2 border-black bg-rose-500 px-2 py-1 text-xs font-black text-white shadow-[0_2px_0_#000]">Secret</span>}
            {isNextTarget && <span className="rounded-md border-2 border-black bg-amber-300 px-2 py-1 text-xs font-black text-slate-950 shadow-[0_2px_0_#000]">Next Target</span>}
          </div>
          <div className="mt-2 text-sm font-semibold text-cyan-100 drop-shadow-[0_2px_0_#000]">
            ID {mark.id} · Cost {formatScaled(mark.costPerBaseOpen, scaleUtils)} {mark.costCurrency} · Base interval {mark.baseOpenIntervalSeconds}s
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Chance" value={chanceText} copyLabel={copyLabel} copiedText={copiedText} onCopy={() => onCopy(chanceText, copyLabel)} />
          <Metric label="Copies/hour" value={formatScaled(mark.estimate.expectedCopiesPerHour, scaleUtils)} />
          <Metric label="First base drop" value={formatTimeHuman(mark.estimate.secondsForFirstBaseDrop)} />
          <Metric label="Target ETA" value={formatTimeHuman(mark.estimate.secondsForTargetCopies)} strong />
          <Metric label="ETA seconds" value={Number.isFinite(mark.estimate.secondsForTargetCopies) ? formatScaled(mark.estimate.secondsForTargetCopies, scaleUtils) : 'Never'} />
          <Metric label="Opens/second" value={formatScaled(mark.estimate.marksPerSecond, scaleUtils)} />
        </div>

        <div>
          <div className="mb-2 text-sm font-black text-white drop-shadow-[0_2px_0_#000]">Effects and caps</div>
          {effectEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {effectEntries.map(([effect, perCopy]) => (
                <span key={effect} className="rounded-md border-2 border-black bg-slate-900/90 px-2 py-1 text-xs font-semibold text-white shadow-[0_2px_0_#000]">
                  <span className="font-medium">{formatEffectName(effect)}</span>: {formatScaled(perCopy, scaleUtils)}
                  <span className="text-cyan-200"> cap {formatNumericValue(mark.effectCaps?.[effect], scaleUtils)}</span>
                  {mark.effectCurves?.[effect] && <span className="text-cyan-300"> curve</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm font-semibold text-cyan-100">No effects listed</div>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  strong = false,
  copyLabel,
  copiedText,
  onCopy
}: {
  label: string;
  value: string;
  strong?: boolean;
  copyLabel?: string;
  copiedText?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="min-w-0 rounded-md border-2 border-black bg-slate-900/90 px-3 py-2 shadow-[0_3px_0_#000]">
      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase text-cyan-200">
        <span>{label}</span>
        {onCopy && copyLabel && (
          <button type="button" onClick={onCopy} className="rounded p-1 hover:bg-cyan-900" title={`Copy ${label}`}>
            {copiedText === copyLabel ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
      </div>
      <div className={`mt-1 break-words font-mono text-sm drop-shadow-[0_2px_0_#000] ${strong ? 'font-black text-cyan-200' : 'font-bold text-white'}`}>
        {value}
      </div>
    </div>
  );
}
