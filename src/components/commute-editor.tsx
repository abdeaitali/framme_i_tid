"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Station } from "@/domain/transport";

const DAY_OPTIONS = [
  { value: 1, label: "Mån" },
  { value: 2, label: "Tis" },
  { value: 3, label: "Ons" },
  { value: 4, label: "Tor" },
  { value: 5, label: "Fre" },
  { value: 6, label: "Lör" },
  { value: 7, label: "Sön" },
];

interface CommuteEditorProps {
  stations: Station[];
  initial: {
    originStationId: string;
    destinationStationId: string;
    requiredArrivalTime: string;
    weekdays: number[];
    targetReliability: number;
  };
}

export function CommuteEditor({ stations, initial }: CommuteEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting" | "error">("idle");

  function toggleWeekday(day: number): void {
    setValues((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort(),
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState("saving");
    try {
      const response = await fetch("/api/commute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error("save_failed");
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  async function deleteCommute(): Promise<void> {
    setDeleteState("deleting");
    try {
      const response = await fetch("/api/commute", { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      router.push("/pendling?deleted=1");
      router.refresh();
    } catch {
      setDeleteState("error");
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          Från
          <select
            className="field"
            value={values.originStationId}
            onChange={(event) => setValues({ ...values, originStationId: event.target.value })}
          >
            {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Till
          <select
            className="field"
            value={values.destinationStationId}
            onChange={(event) => setValues({ ...values, destinationStationId: event.target.value })}
          >
            {stations.filter((station) => station.id !== values.originStationId).map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">
          Måste vara framme
          <input
            className="field"
            type="time"
            value={values.requiredArrivalTime}
            onChange={(event) => setValues({ ...values, requiredArrivalTime: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Säkerhetsmål
          <select
            className="field"
            value={String(values.targetReliability)}
            onChange={(event) => setValues({ ...values, targetReliability: Number(event.target.value) })}
          >
            <option value="0.8">80 %</option>
            <option value="0.9">90 %</option>
            <option value="0.95">95 %</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-6">
        <legend className="text-sm font-bold">Pendlingsdagar</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_OPTIONS.map((day) => {
            const checked = values.weekdays.includes(day.value);
            return (
              <label key={day.value} className={`focus-within:ring-4 focus-within:ring-pine/20 cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition ${checked ? "border-pine bg-pine text-white" : "border-ink/15 bg-white"}`}>
                <input
                  className="sr-only"
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleWeekday(day.value)}
                />
                {day.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button type="submit" className="button-primary" disabled={state === "saving" || values.weekdays.length === 0 || values.originStationId === values.destinationStationId}>
          {state === "saving" ? "Sparar…" : "Uppdatera pendling"}
        </button>
        {state === "saved" ? <p role="status" className="text-sm font-bold text-pine">Sparat.</p> : null}
        {state === "error" ? <p role="alert" className="text-sm font-bold text-red-700">Kunde inte spara.</p> : null}
      </div>
      <div className="mt-8 border-t border-ink/10 pt-6">
        <h3 className="font-black">Ta bort sparad pendling</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink/65">
          Pendlingen och kopplingen till den här webbläsaren tas bort permanent.
        </p>
        {deleteState === "confirming" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="button-secondary border-red-200 text-red-700 hover:bg-red-50"
              onClick={deleteCommute}
            >
              Ja, ta bort
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setDeleteState("idle")}
            >
              Avbryt
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button-secondary mt-4 border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => setDeleteState("confirming")}
            disabled={deleteState === "deleting"}
          >
            {deleteState === "deleting" ? "Tar bort…" : "Ta bort sparad pendling"}
          </button>
        )}
        {deleteState === "error" ? (
          <p role="alert" className="mt-3 text-sm font-bold text-red-700">
            Pendlingen kunde inte tas bort. Försök igen.
          </p>
        ) : null}
      </div>
    </form>
  );
}
