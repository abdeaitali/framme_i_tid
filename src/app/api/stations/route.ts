import { stationSearchSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { getPilotStations } from "@/services/station-service";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const { q } = stationSearchSchema.parse({ q: url.searchParams.get("q") ?? "" });
    const stations = await getPilotStations();
    const normalizedQuery = q.toLocaleLowerCase("sv");
    return Response.json({
      data: stations.filter(
        (station) =>
          station.name.toLocaleLowerCase("sv").includes(normalizedQuery) ||
          station.municipality.toLocaleLowerCase("sv").includes(normalizedQuery),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
