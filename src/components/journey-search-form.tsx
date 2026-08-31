"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Station } from "@/domain/transport";

interface JourneySearchFormProps {
  stations: Station[];
  defaultDate: string;
  defaultArrivalTime: string;
  initial?: {
    originStationId?: string;
    destinationStationId?: string;
    requiredArrivalTime?: string;
    targetReliability?: number;
  };
}

export function JourneySearchForm({
  stations,
  defaultDate,
  defaultArrivalTime,
  initial,
}: JourneySearchFormProps) {
  const router = useRouter();
  const stockholm = stations.find((station) => station.externalId === "SE_STA_STO")?.id ?? "";
  const [originStationId, setOriginStationId] = useState(initial?.originStationId ?? stockholm);
  const [destinationStationId, setDestinationStationId] = useState(
    initial?.destinationStationId ?? "",
  );
  const [travelDate, setTravelDate] = useState(defaultDate);
  const [requiredArrivalTime, setRequiredArrivalTime] = useState(
    initial?.requiredArrivalTime ?? defaultArrivalTime,
  );
  const [targetReliability, setTargetReliability] = useState(
    String(initial?.targetReliability ?? 0.9),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const destinationOptions = useMemo(
    () => stations.filter((station) => station.id !== originStationId),
    [originStationId, stations],
  );

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    if (!originStationId || !destinationStationId) {
      setError("Välj både avrese- och destinationsstation.");
      return;
    }
    if (originStationId === destinationStationId) {
      setError("Avrese- och destinationsstation måste vara olika.");
      return;
    }
    if (!travelDate || !requiredArrivalTime) {
      setError("Ange resedatum och när du måste vara framme.");
      return;
    }

    setIsSubmitting(true);
    const query = new URLSearchParams({
      originStationId,
      destinationStationId,
      travelDate,
      requiredArrivalTime,
      targetReliability,
    });
    router.push(`/resultat?${query.toString()}`);
  }

  return (
    <form action="/resultat" method="get" onSubmit={submit} className="space-y-5" aria-describedby={error ? "form-error" : undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          Från
          <select
            className="field"
            name="originStationId"
            value={originStationId}
            onChange={(event) => {
              setOriginStationId(event.target.value);
              if (event.target.value === destinationStationId) setDestinationStationId("");
            }}
            required
          >
            <option value="">Välj station</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Till
          <select
            className="field"
            name="destinationStationId"
            value={destinationStationId}
            onChange={(event) => setDestinationStationId(event.target.value)}
            required
          >
            <option value="">Välj station</option>
            {destinationOptions.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-bold">
          Resedatum
          <input
            className="field"
            name="travelDate"
            type="date"
            value={travelDate}
            onChange={(event) => setTravelDate(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Måste vara framme
          <input
            className="field"
            name="requiredArrivalTime"
            type="time"
            value={requiredArrivalTime}
            onChange={(event) => setRequiredArrivalTime(event.target.value)}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Önskad säkerhet
          <select
            className="field"
            name="targetReliability"
            value={targetReliability}
            onChange={(event) => setTargetReliability(event.target.value)}
          >
            <option value="0.8">80 %</option>
            <option value="0.9">90 %</option>
            <option value="0.95">95 %</option>
          </select>
        </label>
      </div>
      {error ? (
        <p id="form-error" role="alert" className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button-primary w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? "Räknar på avgångar…" : "Hitta säkraste avgången"}
        {!isSubmitting ? <span aria-hidden="true" className="ml-2">→</span> : null}
      </button>
    </form>
  );
}
