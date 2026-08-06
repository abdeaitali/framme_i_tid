import type {
  HistoricalJourneyOutcome,
  RealtimeJourneyStatus,
  ScheduledJourney,
} from "@/domain/transport";
import type {
  ConfidenceLevel,
  JourneyReliabilityResult,
  ReasonCode,
} from "@/domain/reliability";
import { stockholmTime } from "@/lib/time";

const MINUTE = 60_000;

export const RELIABILITY_CONFIG = {
  lowSamplePenalty: 0.05,
  mediumSamplePenalty: 0.02,
  transferMissWeight: 0.25,
  maxTransferPenalty: 0.12,
  maxRealtimeDelayPenalty: 0.2,
  validEarlyArrivalMinutes: -120,
  validLateArrivalMinutes: 720,
} as const;

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function confidenceFor(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= 40) return "HIGH";
  if (sampleSize >= 15) return "MEDIUM";
  return "LOW";
}

function samplePenalty(sampleSize: number): number {
  if (sampleSize < 15) return RELIABILITY_CONFIG.lowSamplePenalty;
  if (sampleSize < 40) return RELIABILITY_CONFIG.mediumSamplePenalty;
  return 0;
}

function realtimePenalty(status?: RealtimeJourneyStatus): number {
  if (!status) return 0;
  if (status.cancelled) return 1;
  const delayPenalty = Math.min(
    Math.max(status.delayMinutes, 0) * 0.01,
    RELIABILITY_CONFIG.maxRealtimeDelayPenalty,
  );
  const disruptionPenalty =
    status.disruptionSeverity === "major"
      ? 0.12
      : status.disruptionSeverity === "minor"
        ? 0.03
        : 0;
  return Math.min(0.3, delayPenalty + disruptionPenalty);
}

export function calculateJourneyReliability(
  candidate: ScheduledJourney,
  observations: HistoricalJourneyOutcome[],
  deadline: Date,
  realtimeStatus?: RealtimeJourneyStatus,
): JourneyReliabilityResult {
  const usable: HistoricalJourneyOutcome[] = [];
  const arrivalDelays: number[] = [];
  let successfulObservations = 0;

  for (const observation of observations) {
    if (observation.cancelled) {
      usable.push(observation);
      continue;
    }
    if (!observation.actualArrival) continue;

    const delayMinutes =
      (observation.actualArrival.getTime() - observation.scheduledArrival.getTime()) / MINUTE;
    if (
      !Number.isFinite(delayMinutes) ||
      delayMinutes < RELIABILITY_CONFIG.validEarlyArrivalMinutes ||
      delayMinutes > RELIABILITY_CONFIG.validLateArrivalMinutes
    ) {
      continue;
    }

    usable.push(observation);
    arrivalDelays.push(delayMinutes);
    const projectedArrival = candidate.scheduledArrival.getTime() + delayMinutes * MINUTE;
    if (projectedArrival <= deadline.getTime()) successfulObservations += 1;
  }

  const usableObservations = usable.length;
  const rawProbability =
    usableObservations === 0 ? 0 : successfulObservations / usableObservations;
  const cancellations = usable.filter((observation) => observation.cancelled).length;
  const cancellationRate = usableObservations === 0 ? 0 : cancellations / usableObservations;
  const transferEvidence = usable.filter(
    (observation) => observation.transferMissed !== null,
  );
  const missedTransferRate =
    candidate.transferCount === 0 || transferEvidence.length === 0
      ? null
      : transferEvidence.filter((observation) => observation.transferMissed).length /
        transferEvidence.length;
  const transferPenalty = Math.min(
    RELIABILITY_CONFIG.maxTransferPenalty,
    (missedTransferRate ?? 0) * RELIABILITY_CONFIG.transferMissWeight,
  );
  const realtimeAdjustment = realtimePenalty(realtimeStatus);
  const adjustedProbability = realtimeStatus?.cancelled
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          rawProbability - samplePenalty(usableObservations) - transferPenalty - realtimeAdjustment,
        ),
      );
  const probability = Math.round(adjustedProbability * 10_000) / 10_000;
  const percentile90DelayMinutes = Math.round(percentile(arrivalDelays, 0.9));
  const recommendedBufferMinutes = Math.max(
    0,
    percentile90DelayMinutes + candidate.transferCount * 5,
  );
  const reasonCodes: ReasonCode[] = [];

  if (probability >= 0.9) reasonCodes.push("HIGH_HISTORICAL_RELIABILITY");
  if (cancellationRate <= 0.03 && usableObservations > 0) {
    reasonCodes.push("LOW_CANCELLATION_RATE");
  }
  if (candidate.transferCount > 0 && (missedTransferRate ?? 0) > 0) {
    reasonCodes.push("TRANSFER_RISK");
  }
  if (usableObservations < 15) reasonCodes.push("LOW_SAMPLE_SIZE");
  if (realtimeAdjustment > 0) reasonCodes.push("CURRENT_DISRUPTION");
  if (recommendedBufferMinutes >= 20) reasonCodes.push("LARGE_RECOMMENDED_BUFFER");

  const successText = `${successfulObservations} av ${usableObservations}`;
  const transferText =
    candidate.transferCount > 0 && missedTransferRate !== null
      ? ` Bytet har missats i ${Math.round(missedTransferRate * 100)} % av observationerna.`
      : "";
  const realtimeText =
    realtimeAdjustment > 0
      ? " En aktuell störning har sänkt den beräknade tillförlitligheten."
      : "";

  return {
    journey: candidate,
    probability,
    rawProbability,
    confidence: confidenceFor(usableObservations),
    usableObservations,
    excludedObservations: observations.length - usableObservations,
    successfulObservations,
    medianDelayMinutes: Math.round(percentile(arrivalDelays, 0.5)),
    percentile80DelayMinutes: Math.round(percentile(arrivalDelays, 0.8)),
    percentile90DelayMinutes,
    cancellationRate,
    missedTransferRate,
    recommendedBufferMinutes,
    reasonCodes,
    explanation: `${successText} jämförbara resor anlände före ${stockholmTime(deadline)}.${transferText}${realtimeText}`,
    realtimeAdjustment,
  };
}
