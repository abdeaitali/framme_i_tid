import { describe, expect, it, vi } from "vitest";
import {
  buildTrainAnnouncementRequest,
  TrafikverketRailDataProvider,
} from "./trafikverket-rail-data-provider";

function apiResponse(announcement: Record<string, unknown>): Response {
  return Response.json({
    RESPONSE: { RESULT: [{ TrainAnnouncement: [announcement] }] },
  });
}

describe("TrafikverketRailDataProvider", () => {
  it("builds a filtered TrainAnnouncement 1.9 request and escapes credentials", () => {
    const request = buildTrainAnnouncementRequest("secret&key", {
      locationSignature: "Lp",
      activityType: "Avgang",
      startTime: new Date("2026-08-10T00:00:00Z"),
      endTime: new Date("2026-08-10T08:00:00Z"),
      trainIdent: "521",
    });

    expect(request).toContain('objecttype="TrainAnnouncement"');
    expect(request).toContain('schemaversion="1.9"');
    expect(request).toContain('name="LocationSignature" value="Lp"');
    expect(request).toContain('name="AdvertisedTrainIdent" value="521"');
    expect(request).toContain('authenticationkey="secret&amp;key"');

    const batchRequest = buildTrainAnnouncementRequest("key", {
      locationSignature: "Lp",
      activityType: "Avgang",
      startTime: new Date("2026-08-10T00:00:00Z"),
      endTime: new Date("2026-08-10T08:00:00Z"),
      trainIdents: ["521", "523"],
    });
    expect(batchRequest).toContain("<OR>");
    expect(batchRequest).toContain('name="AdvertisedTrainIdent" value="521"');
    expect(batchRequest).toContain('name="AdvertisedTrainIdent" value="523"');
  });

  it("matches intercity departures and arrivals and exposes operator/source", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = String(init?.body);
      if (body.includes('value="Avgang"')) {
        return apiResponse({
          ActivityType: "Avgang",
          AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
          AdvertisedTrainIdent: "521",
          Canceled: false,
          Operator: "SJ",
          ProductInformation: [{ Description: "SJ Snabbtåg" }],
          ScheduledDepartureDateTime: "2026-08-10T04:00:00Z",
          TimeAtLocation: "2026-08-10T06:20:00+02:00",
        });
      }
      return apiResponse({
        ActivityType: "Ankomst",
        AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
        AdvertisedTrainIdent: "521",
        Canceled: false,
        EstimatedTimeAtLocation: "2026-08-10T08:15:00+02:00",
        Operator: "SJ",
        ScheduledDepartureDateTime: "2026-08-10T04:00:00Z",
        TimeAtLocation: "2026-08-10T08:14:00+02:00",
      });
    });
    const provider = new TrafikverketRailDataProvider({
      apiKey: "test-key",
      fetcher,
      minRequestIntervalMs: 0,
      stationSignatureResolver: async (stationId) =>
        stationId === "linkoping" ? "Lp" : "Cst",
    });

    const journeys = await provider.findJourneys({
      originStationId: "linkoping",
      destinationStationId: "stockholm",
      serviceDate: new Date("2026-08-10T10:00:00Z"),
      arrivalDeadline: new Date("2026-08-10T06:30:00Z"),
    });

    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({
      externalJourneyId: "trafikverket:linkoping:stockholm:521",
      operatorName: "SJ",
      serviceCategory: "intercity",
      scheduleSource: "trafikverket",
      transferCount: 0,
    });
    expect(journeys[0]?.routeDescription).toBe("SJ Snabbtåg direkt");
  });

  it("builds one station-batch request without an activity filter", () => {
    const request = buildTrainAnnouncementRequest("key", {
      locationSignatures: ["Cst", "Lp", "Nr"],
      startTime: new Date("2026-08-10T00:00:00Z"),
      endTime: new Date("2026-08-10T08:00:00Z"),
      limit: 10_000,
    });

    expect(request).toContain('limit="10000"');
    expect(request).toContain('name="LocationSignature" value="Cst"');
    expect(request).toContain('name="LocationSignature" value="Lp"');
    expect(request).not.toContain('name="ActivityType"');
  });

  it("coalesces identical concurrent queries", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = String(init?.body);
      return apiResponse(
        body.includes('value="Avgang"')
          ? {
              ActivityType: "Avgang",
              AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
              AdvertisedTrainIdent: "521",
            }
          : {
              ActivityType: "Ankomst",
              AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
              AdvertisedTrainIdent: "521",
            },
      );
    });
    const provider = new TrafikverketRailDataProvider({
      apiKey: "test-key",
      fetcher,
      minRequestIntervalMs: 0,
      stationSignatureResolver: async (stationId) =>
        stationId === "linkoping" ? "Lp" : "Cst",
    });
    const input = {
      originStationId: "linkoping",
      destinationStationId: "stockholm",
      serviceDate: new Date("2026-08-10T10:00:00Z"),
      arrivalDeadline: new Date("2026-08-10T06:30:00Z"),
    };

    await Promise.all([provider.findJourneys(input), provider.findJourneys(input)]);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries one rate-limited request", async () => {
    let rateLimited = true;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (rateLimited) {
        rateLimited = false;
        return new Response(null, { status: 429, headers: { "Retry-After": "0" } });
      }
      const body = String(init?.body);
      return apiResponse(
        body.includes('value="Avgang"')
          ? {
              ActivityType: "Avgang",
              AdvertisedTimeAtLocation: "2026-08-10T06:18:00+02:00",
              AdvertisedTrainIdent: "521",
            }
          : {
              ActivityType: "Ankomst",
              AdvertisedTimeAtLocation: "2026-08-10T08:10:00+02:00",
              AdvertisedTrainIdent: "521",
            },
      );
    });
    const provider = new TrafikverketRailDataProvider({
      apiKey: "test-key",
      fetcher,
      minRequestIntervalMs: 0,
      maxRateLimitRetries: 1,
      stationSignatureResolver: async (stationId) =>
        stationId === "linkoping" ? "Lp" : "Cst",
    });

    const journeys = await provider.findJourneys({
      originStationId: "linkoping",
      destinationStationId: "stockholm",
      serviceDate: new Date("2026-08-10T10:00:00Z"),
      arrivalDeadline: new Date("2026-08-10T06:30:00Z"),
    });

    expect(journeys).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
