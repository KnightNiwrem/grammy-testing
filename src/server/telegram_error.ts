/**
 * An error the emulated Bot API reports to the bot in Telegram's `{ ok: false }` envelope.
 * The HTTP status of the response equals `errorCode`, as with the real Bot API.
 */
export class TelegramApiError extends Error {
  constructor(readonly errorCode: number, readonly description: string) {
    super(description);
    this.name = 'TelegramApiError';
  }

  static badRequest(detail: string): TelegramApiError {
    return new TelegramApiError(400, `Bad Request: ${detail}`);
  }

  static unauthorized(): TelegramApiError {
    return new TelegramApiError(401, 'Unauthorized');
  }

  static forbidden(detail: string): TelegramApiError {
    return new TelegramApiError(403, `Forbidden: ${detail}`);
  }

  static notFound(): TelegramApiError {
    return new TelegramApiError(404, 'Not Found');
  }
}

interface TelegramSuccessEnvelope<T> {
  ok: true;
  result: T;
}

interface TelegramErrorEnvelope {
  ok: false;
  error_code: number;
  description: string;
}

export function toSuccessResponse<T>(result: T): Response {
  const envelope: TelegramSuccessEnvelope<T> = { ok: true, result };
  return Response.json(envelope, { status: 200 });
}

export function toErrorResponse(error: TelegramApiError): Response {
  const envelope: TelegramErrorEnvelope = {
    ok: false,
    error_code: error.errorCode,
    description: error.description,
  };
  return Response.json(envelope, { status: error.errorCode });
}
