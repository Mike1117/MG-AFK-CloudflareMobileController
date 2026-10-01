import { describe, expect, it } from "vitest";
import { previousConnectionTimestamps } from "../src/app";

describe("persisted connection history presentation", () => {
  it("excludes the active connection and keeps newest-first previous connections", () => {
    expect(previousConnectionTimestamps([100, 500, 400, 300, 200, 100], 500)).toEqual([400, 300, 200, 100]);
  });

  it("shows at most five unique successful timestamps", () => {
    expect(previousConnectionTimestamps([9, 8, 7, 6, 5, 4, 3], null)).toEqual([9, 8, 7, 6, 5]);
  });

  it("handles missing history and ignores generic diagnostic events", () => {
    expect(previousConnectionTimestamps(undefined, undefined)).toEqual([]);
    expect(previousConnectionTimestamps([{ type: "connected", at: 10 }, { type: "disconnected", at: 20 }], null)).toEqual([]);
  });
});
