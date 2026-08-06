import { formatInTimeZone } from "date-fns-tz";
import { STOCKHOLM_TIME_ZONE } from "@/config/pilot";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { stockholmDateTime, stockholmTime } from "@/lib/time";
import { calculateRecommendation } from "./recommendation-service";

export function databaseTime(value: Date): string {
  return formatInTimeZone(value, "UTC", "HH:mm");
}

export async function getSavedCommute(anonymousSessionId: string) {
  return prisma.savedCommute.findFirst({
    where: { anonymousSessionId },
    include: { originStation: true, destinationStation: true },
    orderBy: { updatedAt: "desc" },
  });
}

export interface WeeklySummaryDay {
  date: string;
  weekday: string;
  selected: boolean;
  departure: string | null;
  probability: number | null;
  elevatedRisk: boolean;
  message?: string;
}

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export async function buildWeeklySummary(commute: Awaited<ReturnType<typeof getSavedCommute>>) {
  if (!commute) throw new AppError("VALIDATION_ERROR", "Ingen sparad pendling hittades.");
  const arrivalTime = databaseTime(commute.requiredArrivalTime);
  const today = stockholmDateTime(
    formatInTimeZone(new Date(), STOCKHOLM_TIME_ZONE, "yyyy-MM-dd"),
    "12:00",
  );
  const days: WeeklySummaryDay[] = [];
  let providerFailureMessage: string | undefined;

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(today.getTime() + offset * 86_400_000);
    const date = formatInTimeZone(day, STOCKHOLM_TIME_ZONE, "yyyy-MM-dd");
    const nativeWeekday = Number(formatInTimeZone(day, STOCKHOLM_TIME_ZONE, "i"));
    const labelIndex = Number(formatInTimeZone(day, STOCKHOLM_TIME_ZONE, "e")) - 1;
    const selected = commute.weekdays.includes(nativeWeekday);

    if (!selected) {
      days.push({
        date,
        weekday: WEEKDAYS[labelIndex] ?? "dag",
        selected: false,
        departure: null,
        probability: null,
        elevatedRisk: false,
      });
      continue;
    }

    if (providerFailureMessage) {
      days.push({
        date,
        weekday: WEEKDAYS[labelIndex] ?? "dag",
        selected: true,
        departure: null,
        probability: null,
        elevatedRisk: true,
        message: providerFailureMessage,
      });
      continue;
    }

    try {
      const recommendation = await calculateRecommendation({
        originStationId: commute.originStationId,
        destinationStationId: commute.destinationStationId,
        serviceDate: stockholmDateTime(date, "12:00"),
        arrivalDeadline: stockholmDateTime(date, arrivalTime),
        targetReliability: commute.targetReliability,
        // The weekly overview is a planning forecast. Current disruption data is
        // only useful for today's detailed result and would multiply API calls.
        includeRealtime: false,
        maxCandidates: 4,
      });
      days.push({
        date,
        weekday: WEEKDAYS[labelIndex] ?? "dag",
        selected: true,
        departure: stockholmTime(recommendation.recommended.journey.scheduledDeparture),
        probability: recommendation.recommended.probability,
        elevatedRisk: recommendation.recommended.probability < commute.targetReliability,
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === "RATE_LIMITED" || error.code === "PROVIDER_UNAVAILABLE")
      ) {
        providerFailureMessage = error.message;
      }
      days.push({
        date,
        weekday: WEEKDAYS[labelIndex] ?? "dag",
        selected: true,
        departure: null,
        probability: null,
        elevatedRisk: true,
        message: error instanceof Error ? error.message : "Kunde inte beräkna dagen.",
      });
    }
  }

  const predictedDays = days.filter(
    (day): day is WeeklySummaryDay & { probability: number; departure: string } =>
      day.probability !== null && day.departure !== null,
  );
  const averageReliability =
    predictedDays.length === 0
      ? null
      : predictedDays.reduce((sum, day) => sum + day.probability, 0) / predictedDays.length;
  const departureCounts = new Map<string, number>();
  for (const day of predictedDays) {
    const minute = Number(day.departure.slice(3, 5));
    const startMinute = minute < 30 ? "00" : "30";
    const window = `${day.departure.slice(0, 2)}:${startMinute}`;
    departureCounts.set(window, (departureCounts.get(window) ?? 0) + 1);
  }
  const mostReliableWindow = [...departureCounts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]?.[0] ?? null;

  return {
    days,
    averageReliability,
    mostReliableWindow,
    elevatedRiskDays: days.filter((day) => day.selected && day.elevatedRisk).length,
  };
}
