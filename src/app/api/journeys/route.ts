import { AppError, errorResponse } from "@/lib/errors";
import { stockholmDateTime } from "@/lib/time";
import { journeySearchSchema } from "@/lib/validation";
import { getTransportDataProvider } from "@/providers";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const parsed = journeySearchSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ogiltig sökning.");
    }
    const values = parsed.data;
    const provider = getTransportDataProvider();
    const journeys = await provider.findJourneys({
      originStationId: values.originStationId,
      destinationStationId: values.destinationStationId,
      serviceDate: stockholmDateTime(values.travelDate, "12:00"),
      arrivalDeadline: stockholmDateTime(values.travelDate, values.requiredArrivalTime),
    });
    if (journeys.length === 0) {
      throw new AppError("NO_JOURNEYS_FOUND", "Inga avgångar hittades.");
    }
    return Response.json({ data: journeys, mode: provider.mode });
  } catch (error) {
    return errorResponse(error);
  }
}
