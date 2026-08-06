import { describe, expect, it } from "vitest";
import type { JourneyReliabilityResult } from "@/domain/reliability";
import type { ScheduledJourney } from "@/domain/transport";
import { selectJourneyRecommendation } from "./recommend";

function result(id: string, departure: string, probability: number): JourneyReliabilityResult {
  const journey: ScheduledJourney = {
    id,
    externalJourneyId: id,
    serviceDate: new Date("2026-08-10T00:00:00Z"),
    originStationId: "origin",
    destinationStationId: "destination",
    scheduledDeparture: new Date(`2026-08-10T${departure}:00Z`),
    scheduledArrival: new Date(`2026-08-10T08:00:00Z`),
    transferCount: 0,
    routeDescription: "Direkt",
  };
  return {
    journey,
    probability,
    rawProbability: probability,
    confidence: "HIGH",
    usableObservations: 50,
    excludedObservations: 0,
    successfulObservations: Math.round(probability * 50),
    medianDelayMinutes: 2,
    percentile80DelayMinutes: 5,
    percentile90DelayMinutes: 8,
    cancellationRate: 0,
    missedTransferRate: null,
    recommendedBufferMinutes: 8,
    reasonCodes: [],
    explanation: "Test.",
    realtimeAdjustment: 0,
  };
}

describe("selectJourneyRecommendation", () => {
  it("selects the latest journey that reaches the target", () => {
    const recommendation = selectJourneyRecommendation([
      result("early", "06:00", 0.96),
      result("latest-safe", "06:30", 0.91),
      result("late-risky", "07:00", 0.7),
    ]);

    expect(recommendation?.recommended.journey.id).toBe("latest-safe");
    expect(recommendation?.meetsTarget).toBe(true);
  });

  it("warns and selects the highest probability when no option reaches the target", () => {
    const recommendation = selectJourneyRecommendation([
      result("best", "06:00", 0.82),
      result("other", "06:30", 0.7),
    ]);

    expect(recommendation?.recommended.journey.id).toBe("best");
    expect(recommendation?.recommended.reasonCodes).toContain("NO_OPTION_MEETS_TARGET");
    expect(recommendation?.meetsTarget).toBe(false);
  });

  it("uses the later departure as the deterministic tie-breaker", () => {
    const recommendation = selectJourneyRecommendation([
      result("early", "06:00", 0.8),
      result("late", "06:30", 0.8),
    ]);

    expect(recommendation?.recommended.journey.id).toBe("late");
  });
});
