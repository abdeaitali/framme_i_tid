export type AppErrorCode =
  | "NO_JOURNEYS_FOUND"
  | "INSUFFICIENT_HISTORICAL_DATA"
  | "INVALID_ARRIVAL_TIME"
  | "SAME_STATION"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "DATABASE_FAILURE"
  | "VALIDATION_ERROR";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  NO_JOURNEYS_FOUND: 404,
  INSUFFICIENT_HISTORICAL_DATA: 422,
  INVALID_ARRIVAL_TIME: 400,
  SAME_STATION: 400,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  DATABASE_FAILURE: 503,
  VALIDATION_ERROR: 400,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: AppErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
    this.status = STATUS_BY_CODE[code];
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return Response.json(
    {
      error: {
        code: "DATABASE_FAILURE",
        message: "Tjänsten kunde inte läsa data just nu. Försök igen om en stund.",
      },
    },
    { status: 503 },
  );
}
