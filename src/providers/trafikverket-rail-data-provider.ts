import { z } from "zod";
import {
  PILOT_STATIONS,
  PILOT_STATION_PROVIDER_IDS,
} from "@/config/pilot";
import type {
  HistoricalJourneyOutcome,
  HistoricalJourneyQuery,
  JourneySearchInput,
  RealtimeJourneyStatus,
  ScheduledJourney,
  TransportDataProvider,
} from "@/domain/transport";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  dateOnlyUtc,
  serviceDateString,
  stockholmDateTime,
} from "@/lib/time";

const informationSchema = z
  .object({ Code: z.string().optional(), Description: z.string().optional() })
  .passthrough();

const announcementSchema = z
  .object({
    ActivityType: z.string().optional(),
    AdvertisedTimeAtLocation: z.string(),
    AdvertisedTrainIdent: z.string().default(""),
    Canceled: z.boolean().optional(),
    Deviation: z.array(informationSchema).optional(),
    EstimatedTimeAtLocation: z.string().optional(),
    LocationSignature: z.string().optional(),
    ModifiedTime: z.string().optional(),
    Operator: z.string().optional(),
    ProductInformation: z.array(informationSchema).optional(),
    ScheduledDepartureDateTime: z.string().optional(),
    TimeAtLocation: z.string().optional(),
  })
  .passthrough();

const responseSchema = z.object({
  RESPONSE: z.object({
    RESULT: z.array(
      z
        .object({ TrainAnnouncement: z.array(announcementSchema).optional() })
        .passthrough(),
    ),
  }),
});

export type TrainAnnouncement = z.infer<typeof announcementSchema>;

interface TrainContext {
  externalJourneyId: string;
  trainIdent: string;
  originSignature: string;
  destinationSignature: string;
  serviceDate: Date;
  operatorName?: string;
}

interface ResolvedRailStation {
  externalId: (typeof PILOT_STATIONS)[number]["externalId"];
  signature: string;
  databaseId?: string;
}

export interface TrafikverketProviderConfig {
  apiKey: string;
  endpoint?: string;
  fetcher?: typeof fetch;
  stationSignatureResolver?: (stationId: string) => Promise<string | null>;
  minRequestIntervalMs?: number;
  maxRateLimitRetries?: number;
  preferStoredData?: boolean;
}

export interface AnnouncementQuery {
  locationSignature?: string;
  locationSignatures?: string[];
  activityType?: "Avgang" | "Ankomst";
  startTime: Date;
  endTime: Date;
  trainIdent?: string;
  trainIdents?: string[];
  limit?: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildTrainAnnouncementRequest(
  authenticationKey: string,
  query: AnnouncementQuery,
): string {
  const locationSignatures = query.locationSignature
    ? [query.locationSignature]
    : [...new Set(query.locationSignatures ?? [])];
  if (locationSignatures.length === 0) {
    throw new Error("At least one Trafikverket location signature is required.");
  }
  const locationFilter =
    locationSignatures.length === 1
      ? `<EQ name="LocationSignature" value="${escapeXml(locationSignatures[0]!)}" />`
      : `<OR>${locationSignatures
          .map(
            (signature) =>
              `<EQ name="LocationSignature" value="${escapeXml(signature)}" />`,
          )
          .join("")}</OR>`;
  const activityFilter = query.activityType
    ? `<EQ name="ActivityType" value="${query.activityType}" />`
    : "";
  const trainIdents = query.trainIdent
    ? [query.trainIdent]
    : [...new Set(query.trainIdents ?? [])];
  const trainFilter =
    trainIdents.length === 0
      ? ""
      : trainIdents.length === 1
        ? `<EQ name="AdvertisedTrainIdent" value="${escapeXml(trainIdents[0]!)}" />`
        : `<OR>${trainIdents
            .map(
              (trainIdent) =>
                `<EQ name="AdvertisedTrainIdent" value="${escapeXml(trainIdent)}" />`,
            )
            .join("")}</OR>`;
  return `<REQUEST>
  <LOGIN authenticationkey="${escapeXml(authenticationKey)}" />
  <QUERY objecttype="TrainAnnouncement" schemaversion="1.9" limit="${query.limit ?? 500}" orderby="AdvertisedTimeAtLocation">
    <FILTER>
      <AND>
        ${locationFilter}
        ${activityFilter}
        <GT name="AdvertisedTimeAtLocation" value="${query.startTime.toISOString()}" />
        <LT name="AdvertisedTimeAtLocation" value="${query.endTime.toISOString()}" />
        ${trainFilter}
      </AND>
    </FILTER>
    <INCLUDE>ActivityType</INCLUDE>
    <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
    <INCLUDE>AdvertisedTrainIdent</INCLUDE>
    <INCLUDE>Canceled</INCLUDE>
    <INCLUDE>Deviation</INCLUDE>
    <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
    <INCLUDE>LocationSignature</INCLUDE>
    <INCLUDE>ModifiedTime</INCLUDE>
    <INCLUDE>Operator</INCLUDE>
    <INCLUDE>ProductInformation</INCLUDE>
    <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
    <INCLUDE>TimeAtLocation</INCLUDE>
  </QUERY>
</REQUEST>`;
}

export function parseTrainAnnouncementResponse(payload: unknown): TrainAnnouncement[] {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("trafikverket.response.invalid", {
      issues: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(" | "),
    });
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Trafikverket returnerade ett oväntat svarsformat.",
    );
  }
  return parsed.data.RESPONSE.RESULT.flatMap(
    (result) => result.TrainAnnouncement ?? [],
  );
}

export function trafikverketJourneyPatternId(
  originExternalId: string,
  destinationExternalId: string,
  trainIdent: string,
): string {
  return `trafikverket:${originExternalId}:${destinationExternalId}:${trainIdent}`;
}

function announcementDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function retryAfterMilliseconds(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return 1_000;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const retryDate = new Date(retryAfter);
  return Number.isNaN(retryDate.getTime())
    ? 1_000
    : Math.max(0, retryDate.getTime() - Date.now());
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function productDescription(announcement: TrainAnnouncement): string | undefined {
  return announcement.ProductInformation?.find((item) => item.Description)?.Description;
}

function sameTrainRun(left: TrainAnnouncement, right: TrainAnnouncement): boolean {
  if (left.AdvertisedTrainIdent !== right.AdvertisedTrainIdent) return false;
  if (left.ScheduledDepartureDateTime && right.ScheduledDepartureDateTime) {
    return left.ScheduledDepartureDateTime === right.ScheduledDepartureDateTime;
  }
  return true;
}

function matchingArrival(
  departure: TrainAnnouncement,
  arrivals: TrainAnnouncement[],
): TrainAnnouncement | undefined {
  const departureTime = announcementDate(departure.AdvertisedTimeAtLocation);
  if (!departureTime) return undefined;
  return arrivals
    .filter((arrival) => {
      const arrivalTime = announcementDate(arrival.AdvertisedTimeAtLocation);
      return sameTrainRun(departure, arrival) && arrivalTime && arrivalTime > departureTime;
    })
    .sort(
      (left, right) =>
        new Date(left.AdvertisedTimeAtLocation).getTime() -
        new Date(right.AdvertisedTimeAtLocation).getTime(),
    )[0];
}

export class TrafikverketRailDataProvider implements TransportDataProvider {
  readonly mode = "trafikverket" as const;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly contexts = new Map<string, TrainContext>();
  private readonly cache = new Map<string, { expiresAt: number; data: TrainAnnouncement[] }>();
  private readonly pendingQueries = new Map<string, Promise<TrainAnnouncement[]>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

  constructor(private readonly config: TrafikverketProviderConfig) {
    this.endpoint = config.endpoint ?? "https://api.trafikinfo.trafikverket.se/v2/data.json";
    this.fetcher = config.fetcher ?? fetch;
  }

  private async resolveStation(stationId: string): Promise<ResolvedRailStation | null> {
    if (this.config.stationSignatureResolver) {
      const signature = await this.config.stationSignatureResolver(stationId);
      return signature
        ? {
            externalId: stationId as (typeof PILOT_STATIONS)[number]["externalId"],
            signature,
          }
        : null;
    }
    const configured = PILOT_STATIONS.find((station) => station.externalId === stationId);
    let externalId = configured?.externalId;
    let databaseId: string | undefined;
    if (configured && this.config.preferStoredData) {
      databaseId = (
        await prisma.station.findUnique({ where: { externalId: configured.externalId } })
      )?.id;
    }
    if (!externalId) {
      const station = await prisma.station.findUnique({ where: { id: stationId } });
      externalId = station?.externalId as (typeof PILOT_STATIONS)[number]["externalId"] | undefined;
      databaseId = station?.id;
    }
    if (!externalId || !(externalId in PILOT_STATION_PROVIDER_IDS)) return null;
    return {
      externalId,
      signature: PILOT_STATION_PROVIDER_IDS[externalId].trafikverketLocationSignature,
      databaseId,
    };
  }

  private rememberContext(
    journey: ScheduledJourney,
    origin: ResolvedRailStation,
    destination: ResolvedRailStation,
  ): void {
    const trainIdent = journey.externalJourneyId.split(":").at(-1);
    if (!trainIdent) return;
    this.contexts.set(journey.externalJourneyId, {
      externalJourneyId: journey.externalJourneyId,
      trainIdent,
      originSignature: origin.signature,
      destinationSignature: destination.signature,
      serviceDate: journey.serviceDate,
      operatorName: journey.operatorName,
    });
  }

  private async findStoredJourneys(
    input: JourneySearchInput,
    origin: ResolvedRailStation,
    destination: ResolvedRailStation,
  ): Promise<ScheduledJourney[]> {
    if (
      !this.config.preferStoredData ||
      !origin.databaseId ||
      !destination.databaseId
    ) {
      return [];
    }
    const records = await prisma.scheduledJourney.findMany({
      where: {
        originStationId: origin.databaseId,
        destinationStationId: destination.databaseId,
        serviceDate: dateOnlyUtc(input.serviceDate),
        scheduledDeparture: { lt: input.arrivalDeadline },
        scheduleSource: "trafikverket",
      },
      orderBy: { scheduledDeparture: "asc" },
    });
    return records.map((record) => {
      const journey: ScheduledJourney = {
        ...record,
        operatorName: record.operatorName ?? undefined,
        serviceCategory: record.serviceCategory as ScheduledJourney["serviceCategory"],
        scheduleSource: "trafikverket",
      };
      this.rememberContext(journey, origin, destination);
      return journey;
    });
  }

  private async queryAnnouncements(query: AnnouncementQuery): Promise<TrainAnnouncement[]> {
    const requestBody = buildTrainAnnouncementRequest(this.config.apiKey, query);
    const cached = this.cache.get(requestBody);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const pending = this.pendingQueries.get(requestBody);
    if (pending) return pending;

    const request = this.loadAnnouncements(requestBody, query);
    this.pendingQueries.set(requestBody, request);
    try {
      return await request;
    } finally {
      this.pendingQueries.delete(requestBody);
    }
  }

  private async loadAnnouncements(
    requestBody: string,
    query: AnnouncementQuery,
  ): Promise<TrainAnnouncement[]> {
    let releaseQueue!: () => void;
    const previousRequest = this.requestQueue;
    this.requestQueue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    await previousRequest;

    try {
      const minInterval = this.config.minRequestIntervalMs ?? 250;
      const intervalWait = Math.max(
        0,
        this.lastRequestStartedAt + minInterval - Date.now(),
      );
      if (intervalWait > 0) await delay(intervalWait);

      const maxRetries = this.config.maxRateLimitRetries ?? 1;
      let response: Response | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        this.lastRequestStartedAt = Date.now();
        try {
          response = await this.fetcher(this.endpoint, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "text/xml" },
            body: requestBody,
            signal: AbortSignal.timeout(15_000),
          });
        } catch (error) {
          throw new AppError(
            "PROVIDER_UNAVAILABLE",
            "Trafikverkets järnvägsdata kunde inte nås.",
            { cause: error },
          );
        }

        if (response.status !== 429) break;
        if (attempt < maxRetries) {
          await delay(Math.min(retryAfterMilliseconds(response), 10_000));
        }
      }

      if (!response || response.status === 429) {
        throw new AppError(
          "RATE_LIMITED",
          "Trafikverkets anropsgräns har nåtts. Vänta en kort stund och försök igen.",
        );
      }
      if (!response.ok) {
        throw new AppError(
          "PROVIDER_UNAVAILABLE",
          `Trafikverket svarade med status ${response.status}.`,
        );
      }

      const data = parseTrainAnnouncementResponse(await response.json());
      const realtimeQuery = query.endTime.getTime() > Date.now() - 86_400_000;
      this.cache.set(requestBody, {
        expiresAt: Date.now() + (realtimeQuery ? 30_000 : 3_600_000),
        data,
      });
      return data;
    } finally {
      releaseQueue();
    }
  }

  async getAnnouncementsForStations(
    locationSignatures: string[],
    startTime: Date,
    endTime: Date,
  ): Promise<TrainAnnouncement[]> {
    return this.queryAnnouncements({
      locationSignatures,
      startTime,
      endTime,
      limit: 10_000,
    });
  }

  async findJourneys(input: JourneySearchInput): Promise<ScheduledJourney[]> {
    const [origin, destination] = await Promise.all([
      this.resolveStation(input.originStationId),
      this.resolveStation(input.destinationStationId),
    ]);
    if (!origin || !destination) {
      throw new AppError(
        "NO_JOURNEYS_FOUND",
        "Stationen saknar mappning till Trafikverkets trafikplatssignatur.",
      );
    }

    const storedJourneys = await this.findStoredJourneys(
      input,
      origin,
      destination,
    );
    if (storedJourneys.length > 0) return storedJourneys;

    const date = serviceDateString(input.serviceDate);
    const startTime = stockholmDateTime(date, "00:00");
    const endTime = new Date(input.arrivalDeadline.getTime() + 6 * 3_600_000);
    const [departures, arrivals] = await Promise.all([
      this.queryAnnouncements({
        locationSignature: origin.signature,
        activityType: "Avgang",
        startTime,
        endTime: input.arrivalDeadline,
      }),
      this.queryAnnouncements({
        locationSignature: destination.signature,
        activityType: "Ankomst",
        startTime,
        endTime,
      }),
    ]);

    const journeys: ScheduledJourney[] = [];
    for (const departure of departures) {
      if (!departure.AdvertisedTrainIdent) continue;
      const arrival = matchingArrival(departure, arrivals);
      const scheduledDeparture = announcementDate(departure.AdvertisedTimeAtLocation);
      const scheduledArrival = announcementDate(arrival?.AdvertisedTimeAtLocation);
      if (!arrival || !scheduledDeparture || !scheduledArrival) continue;
      const externalJourneyId = trafikverketJourneyPatternId(
        origin.externalId,
        destination.externalId,
        departure.AdvertisedTrainIdent,
      );
      const id = `${externalJourneyId}:${serviceDateString(scheduledDeparture)}`;
      const operatorName = departure.Operator ?? arrival.Operator;
      const journey: ScheduledJourney = {
        id,
        externalJourneyId,
        serviceDate: dateOnlyUtc(input.serviceDate),
        originStationId: input.originStationId,
        destinationStationId: input.destinationStationId,
        scheduledDeparture,
        scheduledArrival,
        transferCount: 0,
        routeDescription: `${productDescription(departure) ?? operatorName ?? "Fjärrtåg"} direkt`,
        operatorName,
        serviceCategory: "intercity",
        scheduleSource: "trafikverket",
      };
      this.rememberContext(journey, origin, destination);
      journeys.push(journey);
    }
    return journeys.sort(
      (left, right) => left.scheduledDeparture.getTime() - right.scheduledDeparture.getTime(),
    );
  }

  async getComparableJourneyOutcomes(
    input: HistoricalJourneyQuery,
  ): Promise<HistoricalJourneyOutcome[]> {
    const outcomes = await this.getComparableJourneyOutcomesBatch([input]);
    return outcomes.get(input.externalJourneyId) ?? [];
  }

  private historicalOutcomes(
    input: HistoricalJourneyQuery,
    context: TrainContext,
    departures: TrainAnnouncement[],
    arrivals: TrainAnnouncement[],
  ): HistoricalJourneyOutcome[] {
    return departures
      .filter((departure) => departure.AdvertisedTrainIdent === context.trainIdent)
      .flatMap((departure) => {
      const arrival = matchingArrival(departure, arrivals);
      const scheduledDeparture = announcementDate(departure.AdvertisedTimeAtLocation);
      const scheduledArrival = announcementDate(arrival?.AdvertisedTimeAtLocation);
      if (!arrival || !scheduledDeparture || !scheduledArrival) return [];
      return [
        {
          id: `trafikverket-history:${context.trainIdent}:${scheduledDeparture.toISOString()}`,
          externalJourneyId: input.externalJourneyId,
          serviceDate: dateOnlyUtc(scheduledDeparture),
          scheduledDeparture,
          scheduledArrival,
          actualDeparture: announcementDate(departure.TimeAtLocation),
          actualArrival: announcementDate(arrival.TimeAtLocation),
          cancelled: Boolean(departure.Canceled || arrival.Canceled),
          transferMissed: null,
          source: "trafikverket-train-announcement-v1",
        },
      ];
    });
  }

  async getComparableJourneyOutcomesBatch(
    inputs: HistoricalJourneyQuery[],
  ): Promise<Map<string, HistoricalJourneyOutcome[]>> {
    if (this.config.preferStoredData) {
      const outcomes = new Map<string, HistoricalJourneyOutcome[]>(
        inputs.map((input) => [input.externalJourneyId, []]),
      );
      if (inputs.length === 0) return outcomes;
      const earliestDate = new Date(
        Math.min(
          ...inputs.map(
            (input) =>
              input.serviceDate.getTime() -
              (input.lookbackWeeks ?? 12) * 7 * 86_400_000,
          ),
        ),
      );
      const latestDate = new Date(
        Math.max(...inputs.map((input) => input.serviceDate.getTime())),
      );
      const records = await prisma.historicalJourneyOutcome.findMany({
        where: {
          externalJourneyId: {
            in: [...new Set(inputs.map((input) => input.externalJourneyId))],
          },
          serviceDate: { gte: earliestDate, lt: latestDate },
        },
        orderBy: { serviceDate: "desc" },
      });
      for (const input of inputs) {
        const inputEarliestDate = new Date(
          input.serviceDate.getTime() -
            (input.lookbackWeeks ?? 12) * 7 * 86_400_000,
        );
        outcomes.set(
          input.externalJourneyId,
          records.filter(
            (record) =>
              record.externalJourneyId === input.externalJourneyId &&
              record.serviceDate >= inputEarliestDate &&
              record.serviceDate < input.serviceDate,
          ),
        );
      }
      return outcomes;
    }

    const outcomes = new Map<string, HistoricalJourneyOutcome[]>();
    const groups = new Map<
      string,
      {
        context: TrainContext;
        startTime: Date;
        endTime: Date;
        inputs: HistoricalJourneyQuery[];
      }
    >();

    for (const input of inputs) {
      outcomes.set(input.externalJourneyId, []);
      const context = this.contexts.get(input.externalJourneyId);
      if (!context) continue;
      const endTime = input.serviceDate;
      const startTime = new Date(
        endTime.getTime() - (input.lookbackWeeks ?? 12) * 7 * 86_400_000,
      );
      const key = [
        context.originSignature,
        context.destinationSignature,
        startTime.toISOString(),
        endTime.toISOString(),
      ].join(":");
      const group = groups.get(key);
      if (group) {
        group.inputs.push(input);
      } else {
        groups.set(key, { context, startTime, endTime, inputs: [input] });
      }
    }

    for (const group of groups.values()) {
      const trainIdents = [
        ...new Set(
          group.inputs.flatMap((input) => {
            const context = this.contexts.get(input.externalJourneyId);
            return context ? [context.trainIdent] : [];
          }),
        ),
      ];
      const [departures, arrivals] = await Promise.all([
        this.queryAnnouncements({
          locationSignature: group.context.originSignature,
          activityType: "Avgang",
          startTime: group.startTime,
          endTime: group.endTime,
          trainIdents,
        }),
        this.queryAnnouncements({
          locationSignature: group.context.destinationSignature,
          activityType: "Ankomst",
          startTime: group.startTime,
          endTime: group.endTime,
          trainIdents,
        }),
      ]);
      for (const input of group.inputs) {
        const context = this.contexts.get(input.externalJourneyId);
        if (!context) continue;
        outcomes.set(
          input.externalJourneyId,
          this.historicalOutcomes(input, context, departures, arrivals),
        );
      }
    }

    return outcomes;
  }

  async getCurrentJourneyStatus(
    journeyIds: string[],
  ): Promise<RealtimeJourneyStatus[]> {
    const statuses: RealtimeJourneyStatus[] = [];
    const today = serviceDateString(new Date());
    const groups = new Map<string, TrainContext[]>();
    for (const journeyId of new Set(journeyIds)) {
      const context = this.contexts.get(journeyId);
      if (!context || serviceDateString(context.serviceDate) !== today) continue;
      const key = `${context.destinationSignature}:${today}`;
      groups.set(key, [...(groups.get(key) ?? []), context]);
    }

    for (const contexts of groups.values()) {
      const first = contexts[0];
      if (!first) continue;
      const announcements = await this.queryAnnouncements({
        locationSignature: first.destinationSignature,
        activityType: "Ankomst",
        startTime: stockholmDateTime(today, "00:00"),
        endTime: stockholmDateTime(today, "23:59"),
      });
      for (const context of contexts) {
        const arrival = announcements.find(
          (item) => item.AdvertisedTrainIdent === context.trainIdent,
        );
        if (!arrival) continue;
        const scheduled = announcementDate(arrival.AdvertisedTimeAtLocation);
        const current = announcementDate(
          arrival.TimeAtLocation ?? arrival.EstimatedTimeAtLocation,
        );
        const delayMinutes =
          scheduled && current
            ? Math.max(0, Math.round((current.getTime() - scheduled.getTime()) / 60_000))
            : 0;
        const messages = arrival.Deviation?.flatMap((item) =>
          item.Description ? [item.Description] : [],
        ) ?? [];
        statuses.push({
          journeyId: context.externalJourneyId,
          delayMinutes,
          cancelled: Boolean(arrival.Canceled),
          disruptionSeverity:
            arrival.Canceled || delayMinutes >= 15
              ? "major"
              : delayMinutes > 0 || messages.length > 0
                ? "minor"
                : "none",
          message: messages.join(" ") || undefined,
        });
      }
    }
    return statuses;
  }
}
