/**
 * HTTP transport for the emulation server's admin API, shared by the session and entity handles.
 */
import { ADMIN_PATH_PREFIX, type AdminErrorResponse } from '../shared/admin_protocol.ts';

/** Raised when the emulation server rejects an admin request. */
export class EmulationServerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'EmulationServerError';
  }
}

export class AdminTransport {
  constructor(
    private readonly serverUrl: string,
    private readonly fetchFn: typeof fetch,
  ) {}

  async request<TResponse>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const response = await this.fetchFn(`${this.serverUrl}${ADMIN_PATH_PREFIX}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new EmulationServerError(response.status, await readErrorMessage(response));
    }
    if (response.status === 204) return undefined as TResponse;
    return await response.json() as TResponse;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `emulation server responded with HTTP ${response.status}`;
  try {
    const body = await response.json() as Partial<AdminErrorResponse>;
    return typeof body.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}
