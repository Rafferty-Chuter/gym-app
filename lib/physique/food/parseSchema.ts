/** Shape of one "Describe" result row, shared by the API route and the logger. */
import { z } from "zod";

export const FoodItemSchema = z.object({
  label: z.string().min(1).max(60),
  serving: z.string().max(40),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  fatG: z.number().min(0).max(500),
  carbsG: z.number().min(0).max(1000),
  confidence: z.enum(["high", "medium", "low"]),
});

export const FoodParseOutput = z.object({ items: z.array(FoodItemSchema).max(12) });

export type ParsedFoodItem = z.infer<typeof FoodItemSchema>;
