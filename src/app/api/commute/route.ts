import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AppError, errorResponse } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { saveCommuteSchema } from "@/lib/validation";
import { databaseTime, getSavedCommute } from "@/services/commute-service";

const SESSION_COOKIE = "framme_session";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId) return Response.json({ data: null });
    const commute = await getSavedCommute(sessionId);
    return Response.json({
      data: commute
        ? { ...commute, requiredArrivalTime: databaseTime(commute.requiredArrivalTime) }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const parsed = saveCommuteSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Ogiltiga pendlingsuppgifter.");
    }
    const input = parsed.data;
    const stationCount = await prisma.station.count({
      where: { id: { in: [input.originStationId, input.destinationStationId] } },
    });
    if (stationCount !== 2) {
      throw new AppError("VALIDATION_ERROR", "En eller båda stationerna finns inte.");
    }

    const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? randomUUID();
    const requiredArrivalTime = new Date(`1970-01-01T${input.requiredArrivalTime}:00.000Z`);
    const existing = await prisma.savedCommute.findFirst({ where: { anonymousSessionId: sessionId } });
    const commute = existing
      ? await prisma.savedCommute.update({
          where: { id: existing.id },
          data: { ...input, requiredArrivalTime },
        })
      : await prisma.savedCommute.create({
          data: { ...input, requiredArrivalTime, anonymousSessionId: sessionId },
        });

    const response = NextResponse.json({
      data: { ...commute, requiredArrivalTime: databaseTime(commute.requiredArrivalTime) },
    });
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
