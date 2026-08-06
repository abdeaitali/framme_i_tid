import { NextRequest } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { buildWeeklySummary, getSavedCommute } from "@/services/commute-service";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const sessionId = request.cookies.get("framme_session")?.value;
    if (!sessionId) throw new AppError("VALIDATION_ERROR", "Ingen sparad pendling hittades.");
    const commute = await getSavedCommute(sessionId);
    const summary = await buildWeeklySummary(commute);
    return Response.json({ data: summary });
  } catch (error) {
    return errorResponse(error);
  }
}
