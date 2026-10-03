const SUFFIXES = ["", "K", "M", "B"];

export function formatCompactNumber(value: number): string {
  const amount = Number.isFinite(value) ? Math.abs(Math.trunc(value)) : 0;
  if (amount < 1_000) return String(amount);

  let unit = 0;
  let divisor = 1;
  while (amount / divisor >= 1_000 && unit < SUFFIXES.length - 1) {
    divisor *= 1_000;
    unit += 1;
  }
  let rounded = Number((amount / divisor).toFixed(2));
  if (rounded >= 1_000 && unit < SUFFIXES.length - 1) {
    divisor *= 1_000;
    unit += 1;
    rounded = Number((amount / divisor).toFixed(2));
  }
  return `${rounded}${SUFFIXES[unit]}`;
}
