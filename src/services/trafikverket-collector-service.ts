import type { PrismaClient } from "@prisma/client";
import {
  PILOT_STATIONS,
  PILOT_STATION_PROVIDER_IDS,
} from "@/config/pilot";
import type { ServiceCategory } from "@/domain/transport";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc } from "@/lib/time";
import {
  TrafikverketRailDataProvider,
  trafikverketJourneyPatternId,
  type TrainAnnouncement,
} from "@/providers/trafikverket-rail-data-provider";

const HOUR_MS = 3_600_000;

export interface CollectorStation {
  databaseId: string;
  externalId: (typeof PILOT_STATIONS)[number]["externalId"];
  name: string;
  signature: string;
}

export interface MaterializedTrainJourney {
  externalJourneyId: string;
  serviceDate: Date;
  originStationId: string;
  destinationStationId: string;
  scheduledDeparture: Date;
  scheduledArrival: Date;
  actualDeparture: Date | null;
  actualArrival: Date | null;
  cancelled: boolean;
  routeDescription: string;
  operatorName: string | null;
  serviceCategory: ServiceCategory;
  finalized: boolean;
}

export interface TrafikverketCollectionResult {
  announcements: number;
  observationsUpserted: number;
  scheduledJourneysUpserted: number;
  historicalOutcomesUpserted: number;
  startTime: Date;
  endTime: Date;
}

function announcementDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function descriptions(
  values: Array<{ Description?: string }> | undefined,
): string[] {
  return values?.flatMap((value) =>
    value.Description ? [value.Description] : [],
  ) ?? [];
}

function productDescription(announcement: TrainAnnouncement): string | null {
  return descriptions(announcement.ProductInformation)[0] ?? null;
}

function serviceCategory(description: string | null): ServiceCategory {
  return description &&
    /pendel|regional|mälartåg|öresundståg|pågatåg|västtåg/i.test(description)
    ? "regional"
    : "intercity";
}

function runKey(announcement: TrainAnnouncement): string {
  const advertised = announcementDate(announcement.AdvertisedTimeAtLocation);
  const runDate =
    announcement.ScheduledDepartureDateTime ??
    (advertised ? dateOnlyUtc(advertised).toISOString() : "unknown-date");
  return `${announcement.AdvertisedTrainIdent}|${runDate}`;
}

function sourceId(announcement: TrainAnnouncement): string {
  return [
    runKey(announcement),
    announcement.ActivityType ?? "unknown-activity",
    announcement.LocationSignature ?? "unknown-location",
    announcement.AdvertisedTimeAtLocation,
  ].join("|");
}

function isDeparture(
  announcement: TrainAnnouncement,
): announcement is TrainAnnouncement & { ActivityType: "Avgang" } {
  return announcement.ActivityType === "Avgang";
}

function isArrival(
  announcement: TrainAnnouncement,
): announcement is TrainAnnouncement & { ActivityType: "Ankomst" } {
  return announcement.ActivityType === "Ankomst";
}

export function materializeTrainJourneys(
  announcements: TrainAnnouncement[],
  stations: CollectorStation[],
  now = new Date(),
  finalizationDelayMinutes = 180,
): MaterializedTrainJourney[] {
  const stationBySignature = new Map(
    stations.map((station) => [station.signature, station]),
  );
  const groups = new Map<string, TrainAnnouncement[]>();

  for (const announcement of announcements) {
    if (
      !announcement.LocationSignature ||
      !stationBySignature.has(announcement.LocationSignature)
    ) {
      continue;
    }
    const key = runKey(announcement);
    groups.set(key, [...(groups.get(key) ?? []), announcement]);
  }

  const journeys: MaterializedTrainJourney[] = [];
  const finalizationCutoff = new Date(
    now.getTime() - finalizationDelayMinutes * 60_000,
  );

  for (const run of groups.values()) {
    const departures = run.filter(isDeparture);
    const arrivals = run.filter(isArrival);
    for (const departure of departures) {
      const origin = stationBySignature.get(departure.LocationSignature!);
      const scheduledDeparture = announcementDate(
        departure.AdvertisedTimeAtLocation,
      );
      if (!origin || !scheduledDeparture) continue;

      for (const arrival of arrivals) {
        const destination = stationBySignature.get(arrival.LocationSignature!);
        const scheduledArrival = announcementDate(
          arrival.AdvertisedTimeAtLocation,
        );
        if (
          !destination ||
          destination.externalId === origin.externalId ||
          !scheduledArrival ||
          scheduledArrival <= scheduledDeparture ||
          scheduledArrival.getTime() - scheduledDeparture.getTime() > 18 * HOUR_MS
        ) {
          continue;
        }

        const description =
          productDescription(departure) ?? productDescription(arrival);
        const operatorName = departure.Operator ?? arrival.Operator ?? null;
        const cancelled = Boolean(departure.Canceled || arrival.Canceled);
        const actualArrival = announcementDate(arrival.TimeAtLocation);
        journeys.push({
          externalJourneyId: trafikverketJourneyPatternId(
            origin.externalId,
            destination.externalId,
            departure.AdvertisedTrainIdent,
          ),
          serviceDate: dateOnlyUtc(scheduledDeparture),
          originStationId: origin.databaseId,
          destinationStationId: destination.databaseId,
          scheduledDeparture,
          scheduledArrival,
          actualDeparture: announcementDate(departure.TimeAtLocation),
          actualArrival,
          cancelled,
          routeDescription: `${description ?? operatorName ?? "Tåg"} direkt`,
          operatorName,
          serviceCategory: serviceCategory(description),
          finalized:
            cancelled ||
            actualArrival !== null ||
            scheduledArrival <= finalizationCutoff,
        });
      }
    }
  }

  return journeys;
}

async function inBatches<T>(
  values: T[],
  operation: (value: T) => Promise<unknown>,
  batchSize = 25,
): Promise<void> {
  for (let index = 0; index < values.length; index += batchSize) {
    await Promise.all(values.slice(index, index + batchSize).map(operation));
  }
}

async function ensureCollectorStations(
  database: PrismaClient,
): Promise<CollectorStation[]> {
  await inBatches([...PILOT_STATIONS], (station) =>
    database.station.upsert({
      where: { externalId: station.externalId },
      update: station,
      create: station,
    }),
  );
  const records = await database.station.findMany({
    where: { externalId: { in: PILOT_STATIONS.map((station) => station.externalId) } },
  });
  const recordByExternalId = new Map(
    records.map((station) => [station.externalId, station]),
  );
  return PILOT_STATIONS.flatMap((station) => {
    const databaseStation = recordByExternalId.get(station.externalId);
    if (!databaseStation) return [];
    return [
      {
        databaseId: databaseStation.id,
        externalId: station.externalId,
        name: station.name,
        signature:
          PILOT_STATION_PROVIDER_IDS[station.externalId]
            .trafikverketLocationSignature,
      },
    ];
  });
}

export async function collectTrafikverketWindow(
  input: { startTime: Date; endTime: Date; finalizationDelayMinutes?: number },
  options: {
    database?: PrismaClient;
    provider?: TrafikverketRailDataProvider;
  } = {},
): Promise<TrafikverketCollectionResult> {
  if (input.endTime <= input.startTime) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Sluttiden för tåginsamlingen måste vara efter starttiden.",
    );
  }
  const database = options.database ?? prisma;
  const apiKey = process.env.TRAFIKVERKET_API_KEY;
  if (!options.provider && !apiKey) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "TRAFIKVERKET_API_KEY saknas för tåginsamlingen.",
    );
  }
  const provider =
    options.provider ??
    new TrafikverketRailDataProvider({
      apiKey: apiKey!,
      endpoint: process.env.TRAFIKVERKET_API_URL,
      minRequestIntervalMs: Number(
        process.env.TRAFIKVERKET_MIN_REQUEST_INTERVAL_MS ?? 250,
      ),
      maxRateLimitRetries: Number(
        process.env.TRAFIKVERKET_RATE_LIMIT_RETRIES ?? 1,
      ),
    });
  const stations = await ensureCollectorStations(database);
  const announcements = await provider.getAnnouncementsForStations(
    stations.map((station) => station.signature),
    input.startTime,
    input.endTime,
  );
  if (announcements.length >= 10_000) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Trafikverket-resultatet nådde 10 000 poster. Kör insamlingen med ett kortare tidsfönster.",
    );
  }

  const validAnnouncements = announcements.filter(
    (announcement) =>
      announcement.AdvertisedTrainIdent &&
      announcement.ActivityType &&
      announcement.LocationSignature &&
      announcementDate(announcement.AdvertisedTimeAtLocation),
  );
  await inBatches(validAnnouncements, async (announcement) => {
    const advertisedTimeAtLocation = announcementDate(
      announcement.AdvertisedTimeAtLocation,
    )!;
    const data = {
      trainIdent: announcement.AdvertisedTrainIdent,
      scheduledDepartureDateTime: announcementDate(
        announcement.ScheduledDepartureDateTime,
      ),
      activityType: announcement.ActivityType!,
      locationSignature: announcement.LocationSignature!,
      advertisedTimeAtLocation,
      estimatedTimeAtLocation: announcementDate(
        announcement.EstimatedTimeAtLocation,
      ),
      actualTimeAtLocation: announcementDate(announcement.TimeAtLocation),
      cancelled: Boolean(announcement.Canceled),
      operatorName: announcement.Operator ?? null,
      productDescription: productDescription(announcement),
      deviations: descriptions(announcement.Deviation),
      sourceModifiedAt: announcementDate(announcement.ModifiedTime),
    };
    await database.trainAnnouncementObservation.upsert({
      where: { sourceId: sourceId(announcement) },
      update: data,
      create: { sourceId: sourceId(announcement), ...data },
    });
  });

  const journeys = materializeTrainJourneys(
    validAnnouncements,
    stations,
    new Date(),
    input.finalizationDelayMinutes,
  );
  await inBatches(journeys, (journey) =>
    database.scheduledJourney.upsert({
      where: {
        externalJourneyId_serviceDate: {
          externalJourneyId: journey.externalJourneyId,
          serviceDate: journey.serviceDate,
        },
      },
      update: {
        scheduledDeparture: journey.scheduledDeparture,
        scheduledArrival: journey.scheduledArrival,
        routeDescription: journey.routeDescription,
        operatorName: journey.operatorName,
        serviceCategory: journey.serviceCategory,
        scheduleSource: "trafikverket",
      },
      create: {
        externalJourneyId: journey.externalJourneyId,
        serviceDate: journey.serviceDate,
        originStationId: journey.originStationId,
        destinationStationId: journey.destinationStationId,
        scheduledDeparture: journey.scheduledDeparture,
        scheduledArrival: journey.scheduledArrival,
        transferCount: 0,
        routeDescription: journey.routeDescription,
        operatorName: journey.operatorName,
        serviceCategory: journey.serviceCategory,
        scheduleSource: "trafikverket",
      },
    }),
  );

  const finalized = journeys.filter((journey) => journey.finalized);
  await inBatches(finalized, (journey) =>
    database.historicalJourneyOutcome.upsert({
      where: {
        externalJourneyId_serviceDate: {
          externalJourneyId: journey.externalJourneyId,
          serviceDate: journey.serviceDate,
        },
      },
      update: {
        scheduledDeparture: journey.scheduledDeparture,
        scheduledArrival: journey.scheduledArrival,
        actualDeparture: journey.actualDeparture,
        actualArrival: journey.actualArrival,
        cancelled: journey.cancelled,
        source: "trafikverket-collected-v1",
      },
      create: {
        externalJourneyId: journey.externalJourneyId,
        serviceDate: journey.serviceDate,
        scheduledDeparture: journey.scheduledDeparture,
        scheduledArrival: journey.scheduledArrival,
        actualDeparture: journey.actualDeparture,
        actualArrival: journey.actualArrival,
        cancelled: journey.cancelled,
        transferMissed: null,
        source: "trafikverket-collected-v1",
      },
    }),
  );

  const result = {
    announcements: announcements.length,
    observationsUpserted: validAnnouncements.length,
    scheduledJourneysUpserted: journeys.length,
    historicalOutcomesUpserted: finalized.length,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  logger.info("trafikverket.collection.completed", {
    announcements: result.announcements,
    scheduledJourneys: result.scheduledJourneysUpserted,
    historicalOutcomes: result.historicalOutcomesUpserted,
  });
  return result;
}
