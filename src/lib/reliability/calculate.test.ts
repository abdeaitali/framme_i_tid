import { describe, expect, it } from "vitest";
import type {
  HistoricalJourneyOutcome,
  RealtimeJourneyStatus,
  ScheduledJourney,
} from "@/domain/transport";
import { calculateJourneyReliability } from "./calculate";

const minute = 60_000;

function journey(overrides: Partial<ScheduledJourney> = {}): ScheduledJourney {
  return {
    id: "journey-1",
    externalJourneyId: "pattern-1",
    serviceDate: new Date("2026-08-10T00:00:00Z"),
    originStationId: "origin",
    destinationStationId: "destination",
    scheduledDeparture: new Date("2026-08-10T06:00:00Z"),
    scheduledArrival: new Date("2026-08-10T07:00:00Z"),
    transferCount: 0,
    routeDescription: "Direkttåg",
    ...overrides,
  };
}

function outcomes(
  count: number,
  options: {
    delayFor?: (index: number) => number;
    cancelledFor?: (index: number) => boolean;
    missingFor?: (index: number) => boolean;
    transferMissedFor?: (index: number) => boolean | null;
  } = {},
): HistoricalJourneyOutcome[] {
  return Array.from({ length: count }, (_, index) => {
    const scheduledDeparture = new Date(`2026-07-${String((index % 28) + 1).padStart(2, "0")}T06:00:00Z`);
    const scheduledArrival = new Date(scheduledDeparture.getTime() + 60 * minute);
    const cancelled = options.cancelledFor?.(index) ?? false;
    const missing = options.missingFor?.(index) ?? false;
    const delay = options.delayFor?.(index) ?? 0;
    return {
      id: `observation-${index}`,
      externalJourneyId: "pattern-1",
      serviceDate: scheduledDeparture,
      scheduledDeparture,
      scheduledArrival,
      actualDeparture: cancelled || missing ? null : scheduledDeparture,
      actualArrival:
        cancelled || missing ? null : new Date(scheduledArrival.getTime() + delay * minute),
      cancelled,
      transferMissed: options.transferMissedFor?.(index) ?? false,
      source: "test",
    };
  });
}

describe("calculateJourneyReliability", () => {
  it("returns full reliability when all journeys arrive before the deadline", () => {
    const result = calculateJourneyReliability(
      journey(),
      outcomes(40),
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.probability).toBe(1);
    expect(result.successfulObservations).toBe(40);
    expect(result.confidence).toBe("HIGH");
  });

  it("uses projected delay to count delayed arrivals", () => {
    const result = calculateJourneyReliability(
      journey(),
      outcomes(40, { delayFor: (index) => (index < 10 ? 20 : 5) }),
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.rawProbability).toBe(0.75);
    expect(result.percentile90DelayMinutes).toBe(20);
  });

  it("treats cancellations as failures", () => {
    const result = calculateJourneyReliability(
      journey(),
      outcomes(40, { cancelledFor: (index) => index < 4 }),
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.successfulObservations).toBe(36);
    expect(result.rawProbability).toBe(0.9);
    expect(result.cancellationRate).toBe(0.1);
  });

  it("applies the configured low-sample penalty", () => {
    const result = calculateJourneyReliability(
      journey(),
      outcomes(10),
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.probability).toBe(0.95);
    expect(result.confidence).toBe("LOW");
    expect(result.reasonCodes).toContain("LOW_SAMPLE_SIZE");
  });

  it("excludes missing and clearly invalid observations", () => {
    const records = outcomes(20, {
      missingFor: (index) => index < 4,
      delayFor: (index) => (index === 4 ? 900 : 0),
    });
    const result = calculateJourneyReliability(
      journey(),
      records,
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.usableObservations).toBe(15);
    expect(result.excludedObservations).toBe(5);
    expect(result.confidence).toBe("MEDIUM");
  });

  it("penalizes observed missed transfers", () => {
    const candidate = journey({ transferCount: 1 });
    const result = calculateJourneyReliability(
      candidate,
      outcomes(40, {
        delayFor: (index) => (index % 4 === 0 ? 30 : 0),
        transferMissedFor: (index) => index % 4 === 0,
      }),
      new Date("2026-08-10T07:10:00Z"),
    );

    expect(result.missedTransferRate).toBe(0.25);
    expect(result.probability).toBe(0.6875);
    expect(result.reasonCodes).toContain("TRANSFER_RISK");
  });

  it("applies a realtime disruption penalty", () => {
    const status: RealtimeJourneyStatus = {
      journeyId: "pattern-1",
      delayMinutes: 5,
      cancelled: false,
      disruptionSeverity: "minor",
    };
    const result = calculateJourneyReliability(
      journey(),
      outcomes(40),
      new Date("2026-08-10T07:10:00Z"),
      status,
    );

    expect(result.probability).toBe(0.92);
    expect(result.realtimeAdjustment).toBe(0.08);
    expect(result.reasonCodes).toContain("CURRENT_DISRUPTION");
  });

  it("projects delays correctly when the deadline crosses midnight", () => {
    const candidate = journey({
      scheduledDeparture: new Date("2026-08-10T22:30:00Z"),
      scheduledArrival: new Date("2026-08-10T23:45:00Z"),
    });
    const result = calculateJourneyReliability(
      candidate,
      outcomes(40, { delayFor: (index) => (index < 8 ? 25 : 5) }),
      new Date("2026-08-11T00:00:00Z"),
    );

    expect(result.successfulObservations).toBe(32);
    expect(result.rawProbability).toBe(0.8);
  });
});
