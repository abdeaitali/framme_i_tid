import { AppError, errorResponse } from "@/lib/errors";
import { stockholmDateTime } from "@/lib/time";
import { journeySearchSchema } from "@/lib/validation";
import { calculateRecommendation } from "@/services/recommendation-service";

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = journeySearchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ogiltig sökning.");
    }
    const values = parsed.data;
    const recommendation = await calculateRecommendation({
      originStationId: values.originStationId,
      destinationStationId: values.destinationStationId,
      serviceDate: stockholmDateTime(values.travelDate, "12:00"),
      arrivalDeadline: stockholmDateTime(values.travelDate, values.requiredArrivalTime),
      targetReliability: values.targetReliability,
    });
    return Response.json({ data: recommendation });
  } catch (error) {
    return errorResponse(error);
  }
}
