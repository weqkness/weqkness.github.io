const TIME_UNITS = [
  { name: 'year', seconds: 365.25 * 24 * 60 * 60 },
  { name: 'day', seconds: 24 * 60 * 60 },
  { name: 'hour', seconds: 60 * 60 },
  { name: 'minute', seconds: 60 },
  { name: 'second', seconds: 1 }
];

export function formatTimeHuman(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return 'Never';
  }

  if (seconds < 1) {
    return 'Instant';
  }

  if (seconds > 1e15 * 365.25 * 24 * 60 * 60) {
    return '...';
  }

  const parts: string[] = [];
  let remaining = Math.floor(seconds);

  for (const unit of TIME_UNITS) {
    if (remaining >= unit.seconds) {
      const count = Math.floor(remaining / unit.seconds);
      remaining %= unit.seconds;

      const unitName = count === 1 ? unit.name : `${unit.name}s`;
      parts.push(`${count} ${unitName}`);

      if (parts.length >= 3) {
        break;
      }
    }
  }

  return parts.length === 0 ? 'Instant' : parts.join(', ');
}

export function formatNumberWithSuffix(num: number): string {
  if (!Number.isFinite(num)) {
    return num.toString();
  }

  if (Math.abs(num) < 1000) {
    return num.toString();
  }

  const units = ['', 'K', 'M', 'B', 'T', 'Qd', 'Qn', 'Sx', 'Sp'];
  const unitIndex = Math.floor(Math.log10(Math.abs(num)) / 3);

  if (unitIndex >= units.length) {
    return num.toExponential(2);
  }

  const scaled = num / Math.pow(1000, unitIndex);
  return `${scaled.toPrecision(3)}${units[unitIndex]}`;
}
