import { errorResponse } from "@/lib/errors";
import { importMockData } from "@/services/mock-import-service";

export async function POST(): Promise<Response> {
  try {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "Mockimport är avstängd i produktion." } },
        { status: 403 },
      );
    }
    const result = await importMockData();
    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
