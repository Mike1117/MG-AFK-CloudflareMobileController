const SUFFIXES = ["", "K", "M", "B"];

export function formatDuration(milliseconds?: number | null): string {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  let seconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(seconds / 86_400); seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600); seconds %= 3_600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

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
