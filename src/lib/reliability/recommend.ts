import type {
  JourneyRecommendation,
  JourneyReliabilityResult,
  ReasonCode,
} from "@/domain/reliability";

function rankByProbability(left: JourneyReliabilityResult, right: JourneyReliabilityResult): number {
  return (
    right.probability - left.probability ||
    right.journey.scheduledDeparture.getTime() - left.journey.scheduledDeparture.getTime() ||
    left.journey.transferCount - right.journey.transferCount ||
    right.usableObservations - left.usableObservations
  );
}

function withReason(
  result: JourneyReliabilityResult,
  code: ReasonCode,
  explanationSuffix: string,
): JourneyReliabilityResult {
  return {
    ...result,
    reasonCodes: result.reasonCodes.includes(code)
      ? result.reasonCodes
      : [...result.reasonCodes, code],
    explanation: `${result.explanation} ${explanationSuffix}`,
  };
}

export function selectJourneyRecommendation(
  results: JourneyReliabilityResult[],
  targetReliability = 0.9,
): JourneyRecommendation | null {
  if (results.length === 0) return null;

  const eligible = results
    .filter((result) => result.probability >= targetReliability)
    .sort(
      (left, right) =>
        right.journey.scheduledDeparture.getTime() - left.journey.scheduledDeparture.getTime() ||
        left.journey.transferCount - right.journey.transferCount ||
        right.usableObservations - left.usableObservations,
    );

  const meetsTarget = eligible.length > 0;
  let recommended = meetsTarget
    ? eligible[0]!
    : [...results].sort(rankByProbability)[0]!;

  const later = results
    .filter(
      (result) =>
        result.journey.id !== recommended.journey.id &&
        result.journey.scheduledDeparture > recommended.journey.scheduledDeparture,
    )
    .sort(
      (left, right) =>
        left.journey.scheduledDeparture.getTime() - right.journey.scheduledDeparture.getTime(),
    );
  const earlier = results
    .filter(
      (result) =>
        result.journey.id !== recommended.journey.id &&
        result.journey.scheduledDeparture < recommended.journey.scheduledDeparture,
    )
    .sort(rankByProbability);

  if (!meetsTarget) {
    recommended = withReason(
      recommended,
      "NO_OPTION_MEETS_TARGET",
      `Ingen avgång når målet på ${Math.round(targetReliability * 100)} %, så detta är alternativet med högst beräknad sannolikhet.`,
    );
  } else if (later.some((result) => result.probability < recommended.probability)) {
    recommended = withReason(
      recommended,
      "SAFER_THAN_LATER_OPTION",
      "Den är säkrare än nästa senare avgång enligt historiken.",
    );
  }

  const selected: JourneyReliabilityResult[] = [];
  const add = (result: JourneyReliabilityResult | undefined): void => {
    if (
      result &&
      result.journey.id !== recommended.journey.id &&
      !selected.some((item) => item.journey.id === result.journey.id)
    ) {
      selected.push(result);
    }
  };

  add(later[0]);
  add(earlier[0]);
  for (const result of [...results].sort(rankByProbability)) {
    if (selected.length >= 3) break;
    add(result);
  }

  return {
    recommended,
    alternatives: selected.slice(0, 3),
    meetsTarget,
    targetReliability,
  };
}
