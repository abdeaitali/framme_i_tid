"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface SaveCommuteButtonProps {
  originStationId: string;
  destinationStationId: string;
  requiredArrivalTime: string;
  targetReliability: number;
}

export function SaveCommuteButton(props: SaveCommuteButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function save(): Promise<void> {
    setState("saving");
    try {
      const response = await fetch("/api/commute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...props, weekdays: [1, 2, 3, 4, 5] }),
      });
      if (!response.ok) throw new Error("save_failed");
      router.push("/pendling?saved=1");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <button type="button" onClick={save} className="button-secondary w-full sm:w-auto" disabled={state === "saving"}>
        {state === "saving" ? "Sparar…" : "Spara som återkommande resa"}
      </button>
      {state === "error" ? <p role="alert" className="mt-2 text-sm text-red-700">Kunde inte spara resan. Försök igen.</p> : null}
    </div>
  );
}
