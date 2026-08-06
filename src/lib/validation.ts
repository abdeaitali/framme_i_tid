import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const journeySearchSchema = z
  .object({
    originStationId: z.string().min(1, "Välj en avresestation."),
    destinationStationId: z.string().min(1, "Välj en destination."),
    travelDate: z.string().regex(datePattern, "Ange ett giltigt resedatum."),
    requiredArrivalTime: z.string().regex(timePattern, "Ange en giltig ankomsttid."),
    targetReliability: z.coerce.number().min(0.5).max(0.99).default(0.9),
  })
  .superRefine((value, context) => {
    if (value.originStationId === value.destinationStationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinationStationId"],
        message: "Avrese- och destinationsstation måste vara olika.",
      });
    }

    const parsed = new Date(`${value.travelDate}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelDate"],
        message: "Ange ett giltigt resedatum.",
      });
    }
  });

export const saveCommuteSchema = z
  .object({
    originStationId: z.string().min(1),
    destinationStationId: z.string().min(1),
    requiredArrivalTime: z.string().regex(timePattern, "Ange en giltig ankomsttid."),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Välj minst en veckodag.")
      .transform((days) => [...new Set(days)].sort()),
    targetReliability: z.number().min(0.5).max(0.99),
  })
  .refine((value) => value.originStationId !== value.destinationStationId, {
    path: ["destinationStationId"],
    message: "Avrese- och destinationsstation måste vara olika.",
  });

export const stationSearchSchema = z.object({
  q: z.string().trim().max(80).default(""),
});

export type JourneySearchValues = z.infer<typeof journeySearchSchema>;
export type SaveCommuteValues = z.input<typeof saveCommuteSchema>;
