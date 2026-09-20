import { z } from 'zod';

import { EmulationClientError } from './emulation_client_error.ts';
import type { RequestDetails } from './types.ts';

interface JsonRequest<T> extends RequestDetails {
  readonly expectedStatus: number;
  readonly responseSchema: z.ZodType<T>;
  readonly body?: unknown;
}

interface EmptyResponseRequest extends RequestDetails {
  readonly expectedStatus: number;
}

interface SerializableRequest extends RequestDetails {
  readonly body?: unknown;
}

export async function requestJson<T>(
  fetchImplementation: typeof globalThis.fetch,
  request: JsonRequest<T>,
): Promise<T> {
  const response = await sendRequest(fetchImplementation, request);
  const responseBody = await readResponseBody(response, request);
  assertResponseStatus(response, responseBody, request);

  let value: unknown;
  try {
    value = JSON.parse(responseBody);
  } catch (cause) {
    throw new EmulationClientError(
      `${formatRequest(request)} returned invalid JSON`,
      { ...request, status: response.status, responseBody },
      { cause },
    );
  }

  const parsedResponse = request.responseSchema.safeParse(value);
  if (!parsedResponse.success) {
    throw new EmulationClientError(
      `${formatRequest(request)} returned a response that does not match its contract: ${
        z.prettifyError(parsedResponse.error)
      }`,
      { ...request, status: response.status, responseBody },
    );
  }

  return parsedResponse.data;
}

export async function requestWithoutBody(
  fetchImplementation: typeof globalThis.fetch,
  request: EmptyResponseRequest,
): Promise<void> {
  const response = await sendRequest(fetchImplementation, request);
  if (response.status === request.expectedStatus) {
    return;
  }

  const responseBody = await readResponseBody(response, request);
  assertResponseStatus(response, responseBody, request);
}

export function normalizeUrlRoot(value: string | URL, parameterName: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new TypeError(`${parameterName} must be an absolute URL`, { cause });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError(`${parameterName} must use the http or https protocol`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new TypeError(`${parameterName} must not contain a query string or fragment`);
  }
  if (!url.pathname.endsWith('/')) {
    url.pathname += '/';
  }

  return url;
}

async function sendRequest(
  fetchImplementation: typeof globalThis.fetch,
  request: SerializableRequest,
): Promise<Response> {
  let serializedRequestBody: string | undefined;
  if (request.body !== undefined) {
    try {
      serializedRequestBody = JSON.stringify(request.body);
    } catch (cause) {
      throw new EmulationClientError(
        `Could not serialize the request body for ${formatRequest(request)}`,
        request,
        { cause },
      );
    }
  }

  try {
    return await fetchImplementation(request.url, {
      method: request.method,
      headers: serializedRequestBody === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
      body: serializedRequestBody,
    });
  } catch (cause) {
    throw new EmulationClientError(`${formatRequest(request)} failed`, request, { cause });
  }
}

async function readResponseBody(response: Response, request: RequestDetails): Promise<string> {
  try {
    return await response.text();
  } catch (cause) {
    throw new EmulationClientError(
      `Could not read the response from ${formatRequest(request)}`,
      { ...request, status: response.status },
      { cause },
    );
  }
}

function assertResponseStatus(
  response: Response,
  responseBody: string,
  request: JsonRequest<unknown> | EmptyResponseRequest,
): void {
  if (response.status !== request.expectedStatus) {
    throw new EmulationClientError(
      `${
        formatRequest(request)
      } returned HTTP ${response.status}; expected ${request.expectedStatus}`,
      { ...request, status: response.status, responseBody },
    );
  }
}

function formatRequest(request: RequestDetails): string {
  return `${request.method} ${request.url}`;
}
