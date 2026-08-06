import { describe, expect, it } from "vitest";
import type { TrainAnnouncement } from "@/providers/trafikverket-rail-data-provider";
import {
  materializeTrainJourneys,
  type CollectorStation,
} from "./trafikverket-collector-service";

const stations: CollectorStation[] = [
  {
    databaseId: "linkoping-db",
    externalId: "SE_STA_LKP",
    name: "Linköping C",
    signature: "Lp",
  },
  {
    databaseId: "norrkoping-db",
    externalId: "SE_STA_NRK",
    name: "Norrköping C",
    signature: "Nr",
  },
  {
    databaseId: "stockholm-db",
    externalId: "SE_STA_STO",
    name: "Stockholm Central",
    signature: "Cst",
  },
];

function announcement(
  values: Partial<TrainAnnouncement> &
    Pick<
      TrainAnnouncement,
      "ActivityType" | "AdvertisedTimeAtLocation" | "LocationSignature"
    >,
): TrainAnnouncement {
  return {
    AdvertisedTrainIdent: "521",
    ScheduledDepartureDateTime: "2026-08-10T04:00:00Z",
    Operator: "SJ",
    ProductInformation: [{ Description: "SJ Snabbtåg" }],
    ...values,
  };
}

describe("materializeTrainJourneys", () => {
  it("creates every ordered configured station pair passed by the same train", () => {
    const journeys = materializeTrainJourneys(
      [
        announcement({
          ActivityType: "Avgang",
          LocationSignature: "Lp",
          AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
          TimeAtLocation: "2026-08-10T06:20:00+02:00",
        }),
        announcement({
          ActivityType: "Ankomst",
          LocationSignature: "Nr",
          AdvertisedTimeAtLocation: "2026-08-10T06:45:00+02:00",
          TimeAtLocation: "2026-08-10T06:48:00+02:00",
        }),
        announcement({
          ActivityType: "Avgang",
          LocationSignature: "Nr",
          AdvertisedTimeAtLocation: "2026-08-10T06:47:00+02:00",
          TimeAtLocation: "2026-08-10T06:50:00+02:00",
        }),
        announcement({
          ActivityType: "Ankomst",
          LocationSignature: "Cst",
          AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
          TimeAtLocation: "2026-08-10T08:14:00+02:00",
        }),
      ],
      stations,
      new Date("2026-08-10T10:00:00Z"),
    );

    expect(journeys.map((journey) => journey.externalJourneyId)).toEqual([
      "trafikverket:SE_STA_LKP:SE_STA_NRK:521",
      "trafikverket:SE_STA_LKP:SE_STA_STO:521",
      "trafikverket:SE_STA_NRK:SE_STA_STO:521",
    ]);
    expect(journeys.every((journey) => journey.finalized)).toBe(true);
    expect(journeys[1]).toMatchObject({
      originStationId: "linkoping-db",
      destinationStationId: "stockholm-db",
      cancelled: false,
      serviceCategory: "intercity",
    });
  });

  it("finalizes cancellations and old records with missing actual times", () => {
    const cancelled = materializeTrainJourneys(
      [
        announcement({
          ActivityType: "Avgang",
          LocationSignature: "Lp",
          AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
          Canceled: true,
        }),
        announcement({
          ActivityType: "Ankomst",
          LocationSignature: "Cst",
          AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
          Canceled: true,
        }),
      ],
      stations,
      new Date("2026-08-10T07:00:00Z"),
    );
    expect(cancelled[0]).toMatchObject({
      cancelled: true,
      actualArrival: null,
      finalized: true,
    });

    const missing = materializeTrainJourneys(
      [
        announcement({
          ActivityType: "Avgang",
          LocationSignature: "Lp",
          AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
        }),
        announcement({
          ActivityType: "Ankomst",
          LocationSignature: "Cst",
          AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
        }),
      ],
      stations,
      new Date("2026-08-10T12:00:00Z"),
      60,
    );
    expect(missing[0]).toMatchObject({
      cancelled: false,
      actualArrival: null,
      finalized: true,
    });
  });
});
