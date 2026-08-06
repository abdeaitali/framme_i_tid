import type { JourneyRecommendation } from "@/domain/reliability";
import type { DataSourceKind } from "@/domain/transport";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { calculateJourneyReliability } from "@/lib/reliability/calculate";
import { selectJourneyRecommendation } from "@/lib/reliability/recommend";
import { getTransportDataProvider } from "@/providers";

export interface RecommendationInput {
  originStationId: string;
  destinationStationId: string;
  serviceDate: Date;
  arrivalDeadline: Date;
  targetReliability: number;
  includeRealtime?: boolean;
  maxCandidates?: number;
}

export interface RecommendationResponse extends JourneyRecommendation {
  dataMode: DataSourceKind;
  calculatedAt: Date;
}

export async function calculateRecommendation(
  input: RecommendationInput,
): Promise<RecommendationResponse> {
  const provider = getTransportDataProvider();
  const journeys = await provider.findJourneys({
    originStationId: input.originStationId,
    destinationStationId: input.destinationStationId,
    serviceDate: input.serviceDate,
    arrivalDeadline: input.arrivalDeadline,
  });

  if (journeys.length === 0) {
    throw new AppError(
      "NO_JOURNEYS_FOUND",
      "Inga pilotavgångar hittades för vald sträcka och tid.",
    );
  }

  const candidates =
    input.maxCandidates && input.maxCandidates > 0
      ? journeys.slice(-input.maxCandidates)
      : journeys;
  const statuses =
    input.includeRealtime === false
      ? []
      : await provider.getCurrentJourneyStatus(
          candidates.map((journey) => journey.externalJourneyId),
        );
  const statusByJourney = new Map(statuses.map((status) => [status.journeyId, status]));
  const historicalQueries = candidates.map((journey) => ({
    externalJourneyId: journey.externalJourneyId,
    serviceDate: input.serviceDate,
    scheduledDeparture: journey.scheduledDeparture,
    lookbackWeeks: 12,
  }));
  const batchedHistory = provider.getComparableJourneyOutcomesBatch
    ? await provider.getComparableJourneyOutcomesBatch(historicalQueries)
    : null;
  const results = await Promise.all(
    candidates.map(async (journey, index) => {
      const query = historicalQueries[index]!;
      const observations = batchedHistory
        ? (batchedHistory.get(journey.externalJourneyId) ?? [])
        : await provider.getComparableJourneyOutcomes(query);
      return calculateJourneyReliability(
        journey,
        observations,
        input.arrivalDeadline,
        statusByJourney.get(journey.externalJourneyId),
      );
    }),
  );

  if (results.every((result) => result.usableObservations === 0)) {
    throw new AppError(
      "INSUFFICIENT_HISTORICAL_DATA",
      "Det saknas användbara historiska observationer för den här sträckan.",
    );
  }

  const recommendation = selectJourneyRecommendation(results, input.targetReliability);
  if (!recommendation) {
    throw new AppError("NO_JOURNEYS_FOUND", "Ingen rekommendation kunde beräknas.");
  }

  logger.info("recommendation.calculated", {
    mode: provider.mode,
    candidates: candidates.length,
    probability: recommendation.recommended.probability,
    sampleSize: recommendation.recommended.usableObservations,
  });

  return { ...recommendation, dataMode: provider.mode, calculatedAt: new Date() };
}
