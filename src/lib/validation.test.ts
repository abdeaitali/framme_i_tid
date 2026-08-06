import { describe, expect, it } from "vitest";
import { journeySearchSchema, saveCommuteSchema } from "./validation";

describe("journeySearchSchema", () => {
  const valid = {
    originStationId: "linkoping",
    destinationStationId: "stockholm",
    travelDate: "2026-08-10",
    requiredArrivalTime: "08:30",
    targetReliability: 0.9,
  };

  it("accepts a valid search", () => {
    expect(journeySearchSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects identical stations", () => {
    expect(
      journeySearchSchema.safeParse({ ...valid, destinationStationId: "linkoping" }).success,
    ).toBe(false);
  });

  it.each(["8:30", "24:00", "08:75", ""])("rejects invalid time %s", (time) => {
    expect(
      journeySearchSchema.safeParse({ ...valid, requiredArrivalTime: time }).success,
    ).toBe(false);
  });
});

describe("saveCommuteSchema", () => {
  it("deduplicates and sorts weekdays", () => {
    const result = saveCommuteSchema.parse({
      originStationId: "a",
      destinationStationId: "b",
      requiredArrivalTime: "08:30",
      weekdays: [5, 1, 1, 3],
      targetReliability: 0.9,
    });

    expect(result.weekdays).toEqual([1, 3, 5]);
  });
});
