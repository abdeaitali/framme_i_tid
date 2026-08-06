import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { STOCKHOLM_TIME_ZONE } from "@/config/pilot";

export function stockholmDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, STOCKHOLM_TIME_ZONE);
}

export function serviceDateString(date: Date): string {
  return formatInTimeZone(date, STOCKHOLM_TIME_ZONE, "yyyy-MM-dd");
}

export function stockholmTime(date: Date): string {
  return formatInTimeZone(date, STOCKHOLM_TIME_ZONE, "HH:mm");
}

export function stockholmDateLabel(date: Date): string {
  return formatInTimeZone(date, STOCKHOLM_TIME_ZONE, "EEE d MMM");
}

export function scheduledTimes(
  serviceDate: Date,
  departureTime: string,
  durationMinutes: number,
): { departure: Date; arrival: Date } {
  const date = serviceDateString(serviceDate);
  const departure = stockholmDateTime(date, departureTime);
  const arrival = new Date(departure.getTime() + durationMinutes * 60_000);
  return { departure, arrival };
}

export function dateOnlyUtc(date: Date): Date {
  return new Date(`${serviceDateString(date)}T00:00:00.000Z`);
}

export function nextDateString(date: Date, days: number): string {
  return format(addDays(date, days), "yyyy-MM-dd");
}
