import type { Station } from "@/domain/transport";
import { PILOT_STATIONS } from "@/config/pilot";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function getPilotStations(): Promise<Station[]> {
  try {
    const stations = await prisma.station.findMany({ orderBy: { name: "asc" } });
    if (stations.length > 0) return stations;
  } catch (error) {
    logger.warn("stations.database_unavailable", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  return PILOT_STATIONS.map((station) => ({ id: station.externalId, ...station }));
}

export async function getStationNames(
  originStationId: string,
  destinationStationId: string,
): Promise<{ origin: string; destination: string }> {
  const stations = await getPilotStations();
  return {
    origin: stations.find((station) => station.id === originStationId)?.name ?? "Okänd station",
    destination:
      stations.find((station) => station.id === destinationStationId)?.name ?? "Okänd station",
  };
}
