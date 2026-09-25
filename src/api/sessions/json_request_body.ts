import type { HonoRequest } from 'hono';
import type { z } from 'zod';

/**
 * Reads a request's JSON body as the schema describes it. Returns `undefined` for a body that is
 * not JSON or that the schema rejects, which the emulator's own routes answer with status 400.
 */
export async function readJsonRequestBody<Schema extends z.ZodType<object>>(
  request: HonoRequest,
  schema: Schema,
): Promise<z.output<Schema> | undefined> {
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return undefined;
  }
  const parsedRequestBody = schema.safeParse(requestBody);
  return parsedRequestBody.success ? parsedRequestBody.data : undefined;
}
