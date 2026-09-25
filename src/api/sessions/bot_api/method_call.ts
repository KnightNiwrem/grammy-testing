import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { VirtualBotProfile } from '../../../types/virtual_bot.ts';

/**
 * Who calls a Bot API method, whichever way the call arrived: as an HTTP request, or in a
 * webhook's response to an update.
 */
export interface BotApiMethodContext {
  readonly session: EmulationSession;
  /** The bot whose token authenticated the call. */
  readonly bot: VirtualBotProfile;
  /** Aborts when the caller stops waiting for the answer, as a closed HTTP request does. */
  readonly signal: AbortSignal;
}

/** Telegram's JSON answer to a Bot API method, with the HTTP status that carries it. */
export type BotApiMethodAnswer =
  | {
    readonly status: 200;
    readonly body: {
      readonly ok: true;
      readonly result: unknown;
      /** Telegram describes the outcome of a few methods, such as `setWebhook`. */
      readonly description?: string;
    };
  }
  | {
    readonly status: ContentfulStatusCode;
    readonly body: {
      readonly ok: false;
      readonly error_code: ContentfulStatusCode;
      readonly description: string;
    };
  };

export function botApiResult(result: unknown, description?: string): BotApiMethodAnswer {
  return {
    status: 200,
    body: { ok: true, result, ...(description === undefined ? {} : { description }) },
  };
}

export function botApiError(
  errorCode: ContentfulStatusCode,
  description: string,
): BotApiMethodAnswer {
  return { status: errorCode, body: { ok: false, error_code: errorCode, description } };
}
