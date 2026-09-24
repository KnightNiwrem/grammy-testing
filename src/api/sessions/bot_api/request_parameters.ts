import { z } from 'zod';

/**
 * Bot API method parameters by name. Telegram transmits every parameter as text, whichever
 * encoding carries it, so method schemas parse values from strings.
 */
export type BotApiRequestParameters = Readonly<Record<string, string>>;

/** A file uploaded in a multipart request, under the name its sender gave it. */
export interface BotApiUploadedFile {
  readonly fileName: string;
  readonly content: Uint8Array<ArrayBuffer>;
}

/** Files uploaded in a multipart request, by the name of the part that carries each. */
export type BotApiUploadedFiles = ReadonlyMap<string, BotApiUploadedFile>;

export type BotApiRequestParametersDecoding =
  | {
    readonly decoded: true;
    readonly parameters: BotApiRequestParameters;
    readonly uploadedFiles: BotApiUploadedFiles;
  }
  | { readonly decoded: false; readonly description: string };

const JSON_MEDIA_TYPE = 'application/json';
const URL_ENCODED_FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';
const MULTIPART_FORM_MEDIA_TYPE = 'multipart/form-data';

const DECIMAL_INTEGER_PATTERN = /^-?\d+$/;
/** Spellings that Telegram's `to_bool` reads as true, compared after trimming and lowercasing. */
const TRUE_BOOLEAN_TEXTS = ['true', 'yes', '1'] as const;
const FALSE_BOOLEAN_TEXTS = ['false', 'no', '0'] as const;

/**
 * Collects parameters from the query string and the body, as the official Bot API server's
 * `HttpReader` does. A query-string parameter takes precedence over a body parameter of the same
 * name, because Telegram reads the query string first and uses the first occurrence.
 *
 * A JSON string value is used as-is; any other JSON value is kept as its JSON text, so `2` and
 * `"2"` are equivalent, as are `["message"]` and `"[\"message\"]"`.
 *
 * A multipart body can also upload files, which methods that send files read by part name; as on
 * Telegram, the first file of a name counts, and other methods ignore files.
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
  return {
    decoded: true,
    parameters: Object.fromEntries(parameters),
    uploadedFiles: bodyDecoding.uploadedFiles,
  };
}

type BodyParameterEntriesDecoding =
  | {
    readonly decoded: true;
    readonly parameterEntries: ReadonlyArray<readonly [string, string]>;
    readonly uploadedFiles: BotApiUploadedFiles;
  }
  | { readonly decoded: false; readonly description: string };

const NO_UPLOADED_FILES: BotApiUploadedFiles = new Map();

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
    const uploadedFiles = new Map<string, BotApiUploadedFile>();
    for (const [name, value] of formData) {
      if (typeof value === 'string') {
        parameterEntries.push([name, value]);
      } else if (!uploadedFiles.has(name)) {
        uploadedFiles.set(name, {
          fileName: value.name,
          content: new Uint8Array(await value.arrayBuffer()),
        });
      }
    }
    return { decoded: true, parameterEntries, uploadedFiles };
  }

  const body = await request.text();
  if (body.length === 0) {
    return { decoded: true, parameterEntries: [], uploadedFiles: NO_UPLOADED_FILES };
  }
  if (mediaType === URL_ENCODED_FORM_MEDIA_TYPE) {
    return {
      decoded: true,
      parameterEntries: [...new URLSearchParams(body)],
      uploadedFiles: NO_UPLOADED_FILES,
    };
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
    uploadedFiles: NO_UPLOADED_FILES,
  };
}

/**
 * A parameter holding a decimal integer. Telegram reads any leading digits and ignores the rest;
 * rejecting other text instead surfaces the bot's mistake in tests.
 */
export function integerParameter<Output>(integerSchema: z.ZodType<Output, number>) {
  return z.string().regex(DECIMAL_INTEGER_PATTERN).transform(Number).pipe(integerSchema);
}

/**
 * A parameter holding a boolean, spelled as Telegram accepts it in any letter case. Telegram reads
 * every other text as false; rejecting it instead surfaces the bot's mistake in tests.
 */
export function booleanParameter() {
  return z.string()
    .transform((text) => text.trim().toLowerCase())
    .pipe(z.enum([...TRUE_BOOLEAN_TEXTS, ...FALSE_BOOLEAN_TEXTS]))
    .transform((text) => (TRUE_BOOLEAN_TEXTS as readonly string[]).includes(text));
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
