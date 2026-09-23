import { z } from 'zod';

/**
 * Bot API method parameters by name. Telegram transmits every parameter as text, whichever
 * encoding carries it, so method schemas parse values from strings.
 */
export type BotApiRequestParameters = Readonly<Record<string, string>>;

export type BotApiRequestParametersDecoding =
  | { readonly decoded: true; readonly parameters: BotApiRequestParameters }
  | { readonly decoded: false; readonly description: string };

const JSON_MEDIA_TYPE = 'application/json';
const URL_ENCODED_FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';
const MULTIPART_FORM_MEDIA_TYPE = 'multipart/form-data';

const DECIMAL_INTEGER_PATTERN = /^-?\d+$/;

/**
 * Collects parameters from the query string and the body, as the official Bot API server's
 * `HttpReader` does. A query-string parameter takes precedence over a body parameter of the same
 * name, because Telegram reads the query string first and uses the first occurrence.
 *
 * A JSON string value is used as-is; any other JSON value is kept as its JSON text, so `2` and
 * `"2"` are equivalent, as are `["message"]` and `"[\"message\"]"`.
 *
 * Telegram ignores a body it cannot parse or whose content type it does not decode; rejecting it
 * instead surfaces the bot's mistake in tests.
 */
export async function decodeBotApiRequestParameters(
  request: Request,
): Promise<BotApiRequestParametersDecoding> {
  const parameterEntries: Array<readonly [string, string]> = [
    ...new URL(request.url).searchParams,
  ];

  const bodyDecoding = await decodeBodyParameterEntries(request);
  if (!bodyDecoding.decoded) {
    return bodyDecoding;
  }
  parameterEntries.push(...bodyDecoding.parameterEntries);

  const parameters = new Map<string, string>();
  for (const [name, value] of parameterEntries) {
    if (!parameters.has(name)) {
      parameters.set(name, value);
    }
  }
  return { decoded: true, parameters: Object.fromEntries(parameters) };
}

type BodyParameterEntriesDecoding =
  | { readonly decoded: true; readonly parameterEntries: ReadonlyArray<readonly [string, string]> }
  | { readonly decoded: false; readonly description: string };

async function decodeBodyParameterEntries(
  request: Request,
): Promise<BodyParameterEntriesDecoding> {
  const mediaType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();

  if (mediaType === MULTIPART_FORM_MEDIA_TYPE) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { decoded: false, description: 'Bad Request: invalid multipart/form-data body' };
    }
    const parameterEntries: Array<readonly [string, string]> = [];
    for (const [name, value] of formData) {
      // No implemented method accepts a file.
      if (typeof value !== 'string') {
        return { decoded: false, description: 'Bad Request: file uploads are not supported' };
      }
      parameterEntries.push([name, value]);
    }
    return { decoded: true, parameterEntries };
  }

  const body = await request.text();
  if (body.length === 0) {
    return { decoded: true, parameterEntries: [] };
  }
  if (mediaType === URL_ENCODED_FORM_MEDIA_TYPE) {
    return { decoded: true, parameterEntries: [...new URLSearchParams(body)] };
  }
  if (mediaType === JSON_MEDIA_TYPE) {
    return decodeJsonObjectParameterEntries(body);
  }
  return {
    decoded: false,
    description:
      `Bad Request: unsupported Content-Type; use ${JSON_MEDIA_TYPE}, ${URL_ENCODED_FORM_MEDIA_TYPE}, or ${MULTIPART_FORM_MEDIA_TYPE}`,
  };
}

function decodeJsonObjectParameterEntries(body: string): BodyParameterEntriesDecoding {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return { decoded: false, description: 'Bad Request: invalid JSON body' };
  }
  if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
    return { decoded: false, description: 'Bad Request: JSON object expected' };
  }
  return {
    decoded: true,
    parameterEntries: Object.entries(parsedBody).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  };
}

/**
 * A parameter holding a decimal integer. Telegram reads any leading digits and ignores the rest;
 * rejecting other text instead surfaces the bot's mistake in tests.
 */
export function integerParameter<Output>(integerSchema: z.ZodType<Output, number>) {
  return z.string().regex(DECIMAL_INTEGER_PATTERN).transform(Number).pipe(integerSchema);
}

/** A parameter holding JSON text, such as an array serialized by a form-encoded request. */
export function jsonParameter<Output>(valueSchema: z.ZodType<Output>) {
  return z.string().transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      context.issues.push({ code: 'custom', message: 'Expected JSON text', input: text });
      return z.NEVER;
    }
  }).pipe(valueSchema);
}
