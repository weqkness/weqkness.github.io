# Immortality Incremental Rune Calculator

React + TypeScript calculator for Roblox game **Immortality Incremental** marks.

The app is adapted from the TruthUntold Fishing Incremental rune calculator architecture, but the data model and calculations now target Immortality Incremental's Mark system.

## Features

- Loads the exported game configuration from `public/marks.json`.
- Displays all normal Mark categories and rollable entries.
- Treats hidden marks as secret marks with `isSecret || isHidden`.
- Calculates ETA from Mark Speed, Mark Bulk, Mark Luck, Mark Clone, target copies, and exclusive tier probability.
- Ignores currency generation and assumes the player can afford every open.
- Filters by search text, category, tier, secret status, and effect type.
- Shows effects, caps, curve flags, current-luck chance, copies/hour, first-drop ETA, and target-copy ETA.

## Data

`public/marks.json` is the primary source of truth. It includes:

- Mark categories
- rollable entries
- hidden and secret flags
- cumulative denominators
- base exclusive drop chances at Mark Luck 1
- effect caps and effect curves
- base open interval and cost per open
- source formula notes

`public/scales.json` is used only for parsing and formatting large user-entered values.

## Formulas

Marks per second:

```txt
marksPerSecond = (MarkSpeed / baseOpenIntervalSeconds) * MarkBulk
```

Exclusive tier probability:

```txt
threshold[i] = clamp(MarkLuck / cumulativeDenominator[i], 0, 1)
p[1] = 1 - threshold[2]
p[i] = threshold[i] - threshold[i + 1]
p[last] = threshold[last]
```

At exactly Mark Luck 1, the calculator uses each rollable's exported `baseExclusiveDropChanceAtLuck1`.

ETA:

```txt
secondsForFirstBaseDrop = 1 / (marksPerSecond * exclusiveTierProbability)
secondsForTargetCopies = targetCopies / (marksPerSecond * exclusiveTierProbability * MarkClone)
```

## Development

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

Verification commands:

```bash
npm run build
npm run test
npm run lint
```

## GitHub Pages

Build output is generated in `dist/`:

```bash
npm run build
```

The app fetches static data relative to Vite's `BASE_URL`, so it is compatible with GitHub Pages when deployed with the matching Vite base path.
