/**
 * The body `POST /api/client-error` accepts (TR3): exactly the five fields
 * of `ClientErrorPayload`, each capped, and nothing else (`strict`), so an
 * old or altered client can't add fields that would reach the logs.
 */

import { z } from "zod";
import { CLIENT_ERROR_SOURCES, MAX_MESSAGE_CHARS, MAX_ROUTE_CHARS, MAX_STACK_CHARS, MAX_VERSION_CHARS } from "@/lib/errors/clientError";

export const clientErrorSchema = z
  .object({
    source: z.enum(CLIENT_ERROR_SOURCES),
    message: z.string().min(1).max(MAX_MESSAGE_CHARS),
    stack: z.string().max(MAX_STACK_CHARS),
    route: z.string().max(MAX_ROUTE_CHARS).regex(/^\/[^?#\s]*$/),
    appVersion: z.string().max(MAX_VERSION_CHARS).regex(/^[\w .:()+·-]*$/u),
  })
  .strict();
