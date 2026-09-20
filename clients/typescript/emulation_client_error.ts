import type { HttpMethod, RequestDetails } from './types.ts';

export interface EmulationClientErrorDetails extends RequestDetails {
  readonly status?: number;
  readonly responseBody?: string;
}

/** An HTTP, transport, or response-contract failure reported by the emulation client. */
export class EmulationClientError extends Error {
  override readonly name = 'EmulationClientError';
  readonly method: HttpMethod;
  readonly url: string;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: EmulationClientErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.method = details.method;
    this.url = details.url;
    this.status = details.status;
    this.responseBody = details.responseBody;
  }
}
