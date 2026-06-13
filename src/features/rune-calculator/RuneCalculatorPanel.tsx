import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildScaleUtils,
  calculateMilestoneEffect,
  calculateMilestoneEtaSeconds,
  calculateMilestoneOpensForTier,
  calculateMilestoneTotalOpens,
  findNextUnderHour,
  formatNumericValue,
  formatScaled,
  normalizeMilestoneLevel,
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

const panelClass = 'neon-panel rounded-2xl p-4';
const controlClass = 'neon-control w-full rounded-xl px-3 py-2 text-sm font-bold text-white';
const buttonClass = 'neon-button rounded-xl px-4 py-2 text-sm font-black text-white';
type ActiveView = 'runes' | 'milestones';

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
  const [isDarkTheme, setIsDarkTheme] = useLocalStorage('markCalc_darkTheme', false);
  const [activeView, setActiveView] = useLocalStorage<ActiveView>('markCalc_activeView', 'runes');
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
    document.documentElement.classList.toggle('dark', isDarkTheme);
  }, [isDarkTheme]);

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
    <main className={`neon-app min-h-screen ${isDarkTheme ? 'theme-dark' : 'theme-neon'} text-white`}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="neon-header mb-5 flex flex-col gap-4 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="neon-chip neon-chip-primary mb-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-black uppercase">
              <SparkIcon />
              Immortality Incremental
            </div>
            <h1 className="neon-title text-4xl font-black text-white">
              {activeView === 'milestones' ? 'Milestone Calculator' : 'Mark Rune Calculator'}
            </h1>
            <p className="neon-subtitle mt-2 max-w-2xl text-sm font-semibold">
              {marksData.categories.length} categories, {marksData.categories.reduce((total, category) => total + category.rollables.length, 0)} marks. Currency income is ignored by design.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDarkTheme(!isDarkTheme)}
              className={`${buttonClass} ${isDarkTheme ? 'is-active' : ''}`}
              aria-pressed={isDarkTheme}
            >
              {isDarkTheme ? 'Neon Theme' : 'Dark Theme'}
            </button>
            <a
              href="https://www.roblox.com/"
              className={buttonClass}
            >
              Roblox
            </a>
          </div>
        </header>

        <nav className="neon-tabs mb-5 flex flex-wrap gap-2 rounded-2xl p-2" aria-label="Calculator views">
          <button
            type="button"
            onClick={() => setActiveView('runes')}
            className={`neon-tab rounded-xl px-4 py-2 text-sm font-black ${activeView === 'runes' ? 'is-active' : ''}`}
            aria-pressed={activeView === 'runes'}
          >
            Rune Calculator
          </button>
          <button
            type="button"
            onClick={() => setActiveView('milestones')}
            className={`neon-tab rounded-xl px-4 py-2 text-sm font-black ${activeView === 'milestones' ? 'is-active' : ''}`}
            aria-pressed={activeView === 'milestones'}
          >
            Milestone Calculator
          </button>
        </nav>

        {activeView === 'runes' ? (
          <>
        <section className={`${panelClass} mb-5`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <NumberInput label="Mark Speed" value={markSpeedInput} onChange={setMarkSpeedInput} result={markSpeed} scaleUtils={scaleUtils} copyLabel="speed" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Bulk" value={markBulkInput} onChange={setMarkBulkInput} result={markBulk} scaleUtils={scaleUtils} copyLabel="bulk" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Luck" value={markLuckInput} onChange={setMarkLuckInput} result={markLuck} scaleUtils={scaleUtils} copyLabel="luck" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Mark Clone" value={markCloneInput} onChange={setMarkCloneInput} result={markClone} scaleUtils={scaleUtils} copyLabel="clone" onCopy={copyToClipboard} copiedText={copiedText} />
            <NumberInput label="Target Copies" value={targetCopiesInput} onChange={setTargetCopiesInput} result={targetCopies} scaleUtils={scaleUtils} copyLabel="target" onCopy={copyToClipboard} copiedText={copiedText} />
          </div>

          {!hasValidInputs && (
            <div className="neon-alert mt-4 rounded-xl px-4 py-3 text-sm font-bold">
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

        <section className={`${panelClass} mb-5`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Search">
              <input
                type="search"
                value={filterText}
                onChange={event => setFilterText(event.target.value)}
                className={controlClass}
                placeholder="Name, id, category"
              />
            </Field>

            <Field label="Category">
              <select value={categoryId} onChange={event => setCategoryId(event.target.value)} className={controlClass}>
                <option value="all">All categories</option>
                {marksData.categories.map(category => (
                  <option key={category.id} value={category.id}>{category.displayName}</option>
                ))}
              </select>
            </Field>

            <Field label="Tier">
              <select value={tierFilter} onChange={event => setTierFilter(event.target.value)} className={controlClass}>
                <option value="all">All tiers</option>
                {tiers.map(tier => <option key={tier} value={tier}>Tier {tier}</option>)}
              </select>
            </Field>

            <Field label="Secret">
              <select value={secretFilter} onChange={event => setSecretFilter(event.target.value as 'all' | 'secret' | 'nonSecret')} className={controlClass}>
                <option value="all">All allowed</option>
                <option value="secret">Secret only</option>
                <option value="nonSecret">Non-secret only</option>
              </select>
            </Field>

            <Field label="Effect">
              <select value={effectType} onChange={event => setEffectType(event.target.value)} className={controlClass}>
                <option value="all">All effects</option>
                {effectTypes.map(effect => <option key={effect} value={effect}>{formatEffectName(effect)}</option>)}
              </select>
            </Field>

            <Field label="Sort">
              <select value={sortOrder} onChange={event => setSortOrder(event.target.value as 'asc' | 'desc')} className={controlClass}>
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

        <section className="neon-panel overflow-hidden rounded-2xl">
          <div className="neon-section-title px-4 py-3">
            <h2 className="text-lg font-black text-white">Rune Browser</h2>
          </div>

          <div className="divide-y divide-cyan-300/10">
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
          </>
        ) : (
          <MilestoneCalculator
            scaleUtils={scaleUtils}
            copiedText={copiedText}
            onCopy={copyToClipboard}
          />
        )}
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
          className={`${controlClass} pr-10 font-mono`}
          placeholder="1, 10K, 1Qid"
        />
        <button
          type="button"
          onClick={() => onCopy(formatScaled(result.value, scaleUtils), copyLabel)}
          className="neon-icon-button absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-cyan-100"
          title={`Copy parsed ${label}`}
        >
          {copiedText === copyLabel ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <div className="mt-2 min-h-5 text-xs font-semibold text-cyan-100/90">
        Parsed: <span className="font-mono font-medium">{formatScaled(result.value, scaleUtils)}</span>
        {result.warning && <span className="ml-1 text-amber-300">{result.warning}</span>}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="neon-field-label mb-1.5 block text-xs font-black uppercase">{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="neon-toggle inline-flex items-center gap-2 text-sm font-bold text-white">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-cyan-300/60 bg-slate-950 text-fuchsia-400 focus:ring-fuchsia-400"
      />
      {label}
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="neon-stat rounded-2xl p-4">
      <div className="text-xs font-black uppercase text-cyan-200">{label}</div>
      <div className="mt-2 break-words text-xl font-black text-white">{value}</div>
    </div>
  );
}

function formatMultiplier(value: number, scaleUtils: ScaleUtils): string {
  return Number.isFinite(value) ? `${formatScaled(value, scaleUtils)}x` : 'Too high';
}

function MilestoneCalculator({
  scaleUtils,
  copiedText,
  onCopy
}: {
  scaleUtils: ScaleUtils;
  copiedText: string;
  onCopy: (text: string, label: string) => void;
}) {
  const [mpsInput, setMpsInput] = useLocalStorage('markCalc_milestoneMps', '1');
  const [currentLevelInput, setCurrentLevelInput] = useLocalStorage('markCalc_milestoneCurrent', '0');
  const [targetLevelInput, setTargetLevelInput] = useLocalStorage('markCalc_milestoneTarget', '1');

  const mps = useMemo(() => parseScaled(mpsInput, scaleUtils), [mpsInput, scaleUtils]);
  const currentLevelResult = useMemo(() => parseScaled(currentLevelInput, scaleUtils), [currentLevelInput, scaleUtils]);
  const targetLevelResult = useMemo(() => parseScaled(targetLevelInput, scaleUtils), [targetLevelInput, scaleUtils]);
  const currentLevel = normalizeMilestoneLevel(currentLevelResult.value);
  const targetLevel = normalizeMilestoneLevel(targetLevelResult.value);
  const nextLevel = currentLevel + 1;
  const totalOpens = calculateMilestoneTotalOpens(currentLevel, targetLevel);
  const etaSeconds = calculateMilestoneEtaSeconds(mps.value, currentLevel, targetLevel);
  const currentEffect = calculateMilestoneEffect(currentLevel);
  const targetEffect = calculateMilestoneEffect(targetLevel);
  const gainedEffect = Number.isFinite(currentEffect) && currentEffect > 0
    ? targetEffect / currentEffect
    : Infinity;
  const nextTierOpens = calculateMilestoneOpensForTier(nextLevel);
  const hasValidMps = mps.value > 0;
  const hasForwardTarget = targetLevel > currentLevel;

  return (
    <>
      <section className={`${panelClass} mb-5`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <NumberInput label="MPS" value={mpsInput} onChange={setMpsInput} result={mps} scaleUtils={scaleUtils} copyLabel="milestone-mps" onCopy={onCopy} copiedText={copiedText} />
          <NumberInput label="Current Milestone Level" value={currentLevelInput} onChange={setCurrentLevelInput} result={currentLevelResult} scaleUtils={scaleUtils} copyLabel="milestone-current" onCopy={onCopy} copiedText={copiedText} />
          <NumberInput label="Target Milestone Level" value={targetLevelInput} onChange={setTargetLevelInput} result={targetLevelResult} scaleUtils={scaleUtils} copyLabel="milestone-target" onCopy={onCopy} copiedText={copiedText} />
        </div>

        {!hasValidMps && (
          <div className="neon-alert mt-4 rounded-xl px-4 py-3 text-sm font-bold">
            MPS must be greater than 0 to calculate an ETA.
          </div>
        )}

        {!hasForwardTarget && (
          <div className="neon-alert mt-4 rounded-xl px-4 py-3 text-sm font-bold">
            Target Milestone Level must be higher than Current Milestone Level.
          </div>
        )}
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Metric label="Opens needed" value={formatScaled(totalOpens, scaleUtils)} />
        <Metric label="ETA" value={formatTimeHuman(etaSeconds)} strong />
        <Metric label="ETA seconds" value={Number.isFinite(etaSeconds) ? formatScaled(etaSeconds, scaleUtils) : 'Never'} />
        <Metric label="Current Mark Bulk buff" value={formatMultiplier(currentEffect, scaleUtils)} />
        <Metric label="Target Mark Bulk buff" value={formatMultiplier(targetEffect, scaleUtils)} strong />
        <Metric label="Buff gained" value={formatMultiplier(gainedEffect, scaleUtils)} />
      </section>

      <section className="neon-panel overflow-hidden rounded-2xl">
        <div className="neon-section-title px-4 py-3">
          <h2 className="text-lg font-black text-white">Milestone Rules</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <Metric label={`Level ${nextLevel} opens`} value={formatScaled(nextTierOpens, scaleUtils)} />
          <Metric label="Open scaling" value="10000 * 1.45^(tier - 1)" />
          <Metric label="Mark Bulk buff" value="1.1^tier" />
        </div>
      </section>
    </>
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
    <article className={`neon-row px-4 py-4 transition-colors ${isNextTarget ? 'is-target' : ''}`}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="neon-rune-name text-lg font-black text-white">{mark.name}</h3>
            <span className="neon-badge neon-badge-muted">{mark.categoryName}</span>
            <span className="neon-badge neon-badge-cyan">Tier {mark.tier}</span>
            <span className="neon-badge neon-badge-purple">{mark.rarityText}</span>
            {mark.isSecret && <span className="neon-badge neon-badge-pink">Secret</span>}
            {isNextTarget && <span className="neon-badge neon-badge-gold">Next Target</span>}
          </div>
          <div className="mt-2 text-sm font-semibold text-cyan-100/80">
            ID {mark.id} - Cost {formatScaled(mark.costPerBaseOpen, scaleUtils)} {mark.costCurrency}
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
          <div className="neon-field-label mb-2 text-xs font-black uppercase">Effects and caps</div>
          {effectEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {effectEntries.map(([effect, perCopy]) => (
                <span key={effect} className="neon-effect-pill rounded-lg px-2.5 py-1 text-xs font-semibold text-white">
                  <span className="font-medium">{formatEffectName(effect)}</span>: {formatScaled(perCopy, scaleUtils)}
                  <span className="text-cyan-200/90"> cap {formatNumericValue(mark.effectCaps?.[effect], scaleUtils)}</span>
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
    <div className="neon-metric min-w-0 rounded-xl px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-black uppercase text-cyan-200">
        <span>{label}</span>
        {onCopy && copyLabel && (
          <button type="button" onClick={onCopy} className="neon-icon-button rounded-lg p-1" title={`Copy ${label}`}>
            {copiedText === copyLabel ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
      </div>
      <div className={`mt-1 break-words font-mono text-sm ${strong ? 'font-black text-fuchsia-100' : 'font-bold text-white'}`}>
        {value}
      </div>
    </div>
  );
}
