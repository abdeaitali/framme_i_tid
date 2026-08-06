import { describe, expect, it } from "vitest";
import type { HistoricalJourneyOutcome, Station } from "@/domain/transport";
import { MockTransportDataProvider } from "./mock-transport-data-provider";

const stations: Station[] = [
  {
    id: "linkoping",
    externalId: "SE_STA_LKP",
    name: "Linköping C",
    municipality: "Linköping",
    latitude: 58.4,
    longitude: 15.6,
  },
  {
    id: "stockholm",
    externalId: "SE_STA_STO",
    name: "Stockholm Central",
    municipality: "Stockholm",
    latitude: 59.3,
    longitude: 18.0,
  },
];

const observation: HistoricalJourneyOutcome = {
  id: "history-1",
  externalJourneyId: "mock-lkp-sto-0618",
  serviceDate: new Date("2026-07-20T00:00:00Z"),
  scheduledDeparture: new Date("2026-07-20T04:18:00Z"),
  scheduledArrival: new Date("2026-07-20T06:10:00Z"),
  actualDeparture: new Date("2026-07-20T04:19:00Z"),
  actualArrival: new Date("2026-07-20T06:13:00Z"),
  cancelled: false,
  transferMissed: false,
  source: "test",
};

describe("MockTransportDataProvider", () => {
  it("returns candidate schedules and comparable history without a database", async () => {
    const provider = new MockTransportDataProvider(undefined, {
      stations,
      observations: [observation],
    });
    const serviceDate = new Date("2026-08-10T00:00:00Z");
    const journeys = await provider.findJourneys({
      originStationId: "linkoping",
      destinationStationId: "stockholm",
      serviceDate,
      arrivalDeadline: new Date("2026-08-10T08:00:00Z"),
    });
    const comparable = await provider.getComparableJourneyOutcomes({
      externalJourneyId: "mock-lkp-sto-0618",
      serviceDate,
      scheduledDeparture: journeys[1]!.scheduledDeparture,
    });

    expect(journeys).toHaveLength(5);
    expect(journeys.some((journey) => journey.transferCount === 1)).toBe(true);
    expect(comparable).toEqual([observation]);
  });
});
