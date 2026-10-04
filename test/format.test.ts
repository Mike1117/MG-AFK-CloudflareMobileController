import { describe, expect, it } from "vitest";
import { formatCompactNumber, formatDuration } from "../src/format";

describe("formatCompactNumber", () => {
  it.each([
    [999, "999"],
    [1_000, "1K"],
    [1_234, "1.23K"],
    [12_345, "12.35K"],
    [1_250_000, "1.25M"],
    [1_200_000, "1.2M"],
    [1_234_567_890, "1.23B"],
    [999_999, "1M"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCompactNumber(value)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [45_999, "45s"],
    [5 * 60_000 + 12_000, "5m 12s"],
    [2 * 3_600_000 + 5 * 60_000 + 9_000, "2h 5m 9s"],
    [86_400_000 + 2_000, "1d 2s"],
  ])("formats %i milliseconds as %s", (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });

  it("returns the compatibility placeholder for an unavailable duration", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(null)).toBe("—");
  });
});
