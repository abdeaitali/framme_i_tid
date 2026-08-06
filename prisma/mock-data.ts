import { addDays, getDay } from "date-fns";
import type { MockJourneyTemplate } from "../src/config/pilot";
import type { HistoricalJourneyOutcome } from "../src/domain/transport";
import { dateOnlyUtc, scheduledTimes } from "../src/lib/time";

function deterministicDelay(template: MockJourneyTemplate, index: number, weekday: number): number {
  const normalVariation = ((index * 7 + template.departureTime.charCodeAt(1)) % 9) - 2;
  const weekdayPenalty = weekday === 1 ? 5 : weekday === 5 ? 2 : 0;
  const peakPenalty = template.departureTime >= "06:30" && template.departureTime <= "08:00" ? 2 : 0;
  const majorDelay = index % template.majorDelayEvery === 0 ? 24 + (index % 18) : 0;
  return Math.max(-2, template.baseDelayMinutes + normalVariation + weekdayPenalty + peakPenalty + majorDelay);
}

export function buildHistoricalOutcomes(
  template: MockJourneyTemplate,
  endDate: Date,
  days = 84,
): HistoricalJourneyOutcome[] {
  return Array.from({ length: days }, (_, offset) => {
    const serviceDate = addDays(endDate, -(days - offset));
    const index = offset + 1;
    const times = scheduledTimes(serviceDate, template.departureTime, template.durationMinutes);
    const cancelled = index % template.cancellationEvery === 0;
    const missing = !cancelled && index % template.missingEvery === 0;
    const transferMissed = template.transferMissEvery
      ? index % template.transferMissEvery === 0
      : false;
    const delay = deterministicDelay(template, index, getDay(serviceDate)) + (transferMissed ? 28 : 0);

    return {
      id: `history-${template.externalJourneyId}-${dateOnlyUtc(serviceDate).toISOString().slice(0, 10)}`,
      externalJourneyId: template.externalJourneyId,
      serviceDate: dateOnlyUtc(serviceDate),
      scheduledDeparture: times.departure,
      scheduledArrival: times.arrival,
      actualDeparture: cancelled || missing
        ? null
        : new Date(times.departure.getTime() + Math.max(0, delay - 1) * 60_000),
      actualArrival: cancelled || missing
        ? null
        : new Date(times.arrival.getTime() + delay * 60_000),
      cancelled,
      transferMissed,
      source: "synthetic-mock-v1",
    };
  });
}
