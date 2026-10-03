import { describe, expect, it } from "vitest";
import { formatCompactNumber } from "../src/format";

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
