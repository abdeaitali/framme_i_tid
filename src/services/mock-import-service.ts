import type { PrismaClient } from "@prisma/client";
import { MOCK_JOURNEY_TEMPLATES, PILOT_STATIONS } from "@/config/pilot";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc, scheduledTimes } from "@/lib/time";
import { buildHistoricalOutcomes } from "../../prisma/mock-data";

export async function importMockData(database: PrismaClient = prisma): Promise<{
  stations: number;
  scheduledJourneys: number;
  historicalObservations: number;
}> {
  for (const station of PILOT_STATIONS) {
    await database.station.upsert({
      where: { externalId: station.externalId },
      update: station,
      create: station,
    });
  }

  const stations = await database.station.findMany();
  const byExternalId = new Map(stations.map((station) => [station.externalId, station]));
  const today = new Date();

  for (const template of MOCK_JOURNEY_TEMPLATES) {
    const origin = byExternalId.get(template.originExternalId);
    const destination = byExternalId.get(template.destinationExternalId);
    if (!origin || !destination) throw new Error(`Missing station for ${template.externalJourneyId}`);

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const serviceDate = new Date(today.getTime() + dayOffset * 86_400_000);
      const times = scheduledTimes(serviceDate, template.departureTime, template.durationMinutes);
      await database.scheduledJourney.upsert({
        where: {
          externalJourneyId_serviceDate: {
            externalJourneyId: template.externalJourneyId,
            serviceDate: dateOnlyUtc(serviceDate),
          },
        },
        update: {
          scheduledDeparture: times.departure,
          scheduledArrival: times.arrival,
          transferCount: template.transferCount,
          routeDescription: template.routeDescription,
          operatorName: template.operatorName,
          serviceCategory: template.serviceCategory,
          scheduleSource: "mock",
        },
        create: {
          externalJourneyId: template.externalJourneyId,
          serviceDate: dateOnlyUtc(serviceDate),
          originStationId: origin.id,
          destinationStationId: destination.id,
          scheduledDeparture: times.departure,
          scheduledArrival: times.arrival,
          transferCount: template.transferCount,
          routeDescription: template.routeDescription,
          operatorName: template.operatorName,
          serviceCategory: template.serviceCategory,
          scheduleSource: "mock",
        },
      });
    }

    for (const outcome of buildHistoricalOutcomes(template, today)) {
      await database.historicalJourneyOutcome.upsert({
        where: {
          externalJourneyId_serviceDate: {
            externalJourneyId: outcome.externalJourneyId,
            serviceDate: outcome.serviceDate,
          },
        },
        update: {
          actualDeparture: outcome.actualDeparture,
          actualArrival: outcome.actualArrival,
          cancelled: outcome.cancelled,
          transferMissed: outcome.transferMissed,
          source: outcome.source,
        },
        create: outcome,
      });
    }
  }

  const [scheduledJourneys, historicalObservations] = await Promise.all([
    database.scheduledJourney.count(),
    database.historicalJourneyOutcome.count(),
  ]);
  return { stations: stations.length, scheduledJourneys, historicalObservations };
}
