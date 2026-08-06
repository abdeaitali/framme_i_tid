import type { ScheduledJourney } from "./transport";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ReasonCode =
  | "HIGH_HISTORICAL_RELIABILITY"
  | "LOW_CANCELLATION_RATE"
  | "SAFER_THAN_LATER_OPTION"
  | "TRANSFER_RISK"
  | "LOW_SAMPLE_SIZE"
  | "CURRENT_DISRUPTION"
  | "NO_OPTION_MEETS_TARGET"
  | "LARGE_RECOMMENDED_BUFFER";

export interface JourneyReliabilityResult {
  journey: ScheduledJourney;
  probability: number;
  rawProbability: number;
  confidence: ConfidenceLevel;
  usableObservations: number;
  excludedObservations: number;
  successfulObservations: number;
  medianDelayMinutes: number;
  percentile80DelayMinutes: number;
  percentile90DelayMinutes: number;
  cancellationRate: number;
  missedTransferRate: number | null;
  recommendedBufferMinutes: number;
  reasonCodes: ReasonCode[];
  explanation: string;
  realtimeAdjustment: number;
}

export interface JourneyRecommendation {
  recommended: JourneyReliabilityResult;
  alternatives: JourneyReliabilityResult[];
  meetsTarget: boolean;
  targetReliability: number;
}
