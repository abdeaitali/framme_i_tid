import { getDay } from "date-fns";
import type { PrismaClient } from "@prisma/client";
import { MOCK_JOURNEY_TEMPLATES } from "@/config/pilot";
import type {
  HistoricalJourneyOutcome,
  HistoricalJourneyQuery,
  JourneySearchInput,
  RealtimeJourneyStatus,
  ScheduledJourney,
  Station,
  TransportDataProvider,
} from "@/domain/transport";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { dateOnlyUtc, scheduledTimes } from "@/lib/time";

interface InMemoryMockData {
  stations: Station[];
  observations: HistoricalJourneyOutcome[];
}

export class MockTransportDataProvider implements TransportDataProvider {
  readonly mode = "mock" as const;

  constructor(
    private readonly database: PrismaClient = prisma,
    private readonly inMemory?: InMemoryMockData,
  ) {}

  private async station(id: string): Promise<Station | null> {
    if (this.inMemory) return this.inMemory.stations.find((station) => station.id === id) ?? null;
    return this.database.station.findUnique({ where: { id } });
  }

  async findJourneys(input: JourneySearchInput): Promise<ScheduledJourney[]> {
    const [origin, destination] = await Promise.all([
      this.station(input.originStationId),
      this.station(input.destinationStationId),
    ]);
    if (!origin || !destination) {
      throw new AppError("NO_JOURNEYS_FOUND", "En eller båda stationerna kunde inte hittas.");
    }

    return MOCK_JOURNEY_TEMPLATES.filter(
      (template) =>
        template.originExternalId === origin.externalId &&
        template.destinationExternalId === destination.externalId,
    )
      .map((template) => {
        const times = scheduledTimes(
          input.serviceDate,
          template.departureTime,
          template.durationMinutes,
        );
        return {
          id: `${template.externalJourneyId}-${dateOnlyUtc(input.serviceDate).toISOString().slice(0, 10)}`,
          externalJourneyId: template.externalJourneyId,
          serviceDate: dateOnlyUtc(input.serviceDate),
          originStationId: origin.id,
          destinationStationId: destination.id,
          scheduledDeparture: times.departure,
          scheduledArrival: times.arrival,
          transferCount: template.transferCount,
          routeDescription: template.routeDescription,
          operatorName: template.operatorName,
          serviceCategory: template.serviceCategory,
          scheduleSource: "mock" as const,
        };
      })
      .filter((journey) => journey.scheduledDeparture < input.arrivalDeadline)
      .sort((left, right) => left.scheduledDeparture.getTime() - right.scheduledDeparture.getTime());
  }

  async getComparableJourneyOutcomes(
    input: HistoricalJourneyQuery,
  ): Promise<HistoricalJourneyOutcome[]> {
    const earliestDate = new Date(
      input.serviceDate.getTime() - (input.lookbackWeeks ?? 12) * 7 * 86_400_000,
    );
    const records = this.inMemory
      ? this.inMemory.observations.filter(
          (observation) =>
            observation.externalJourneyId === input.externalJourneyId &&
            observation.serviceDate >= earliestDate &&
            observation.serviceDate < input.serviceDate,
        )
      : await this.database.historicalJourneyOutcome.findMany({
          where: {
            externalJourneyId: input.externalJourneyId,
            serviceDate: { gte: earliestDate, lt: input.serviceDate },
          },
          orderBy: { serviceDate: "desc" },
        });

    const targetWeekday = getDay(input.serviceDate);
    return records
      .map((record) => ({ ...record }))
      .sort((left, right) => {
        const leftSameDay = getDay(left.serviceDate) === targetWeekday ? 1 : 0;
        const rightSameDay = getDay(right.serviceDate) === targetWeekday ? 1 : 0;
        return rightSameDay - leftSameDay || right.serviceDate.getTime() - left.serviceDate.getTime();
      });
  }

  async getCurrentJourneyStatus(journeyIds: string[]): Promise<RealtimeJourneyStatus[]> {
    return journeyIds.map((journeyId) => ({
      journeyId,
      delayMinutes: 0,
      cancelled: false,
      disruptionSeverity: "none",
      message: "Ingen aktuell störning i syntetisk mockdata.",
    }));
  }
}
