/**
 * Implementations of the emulated Telegram Bot API methods. Each method receives the session the
 * request was routed to, the bot identified by the request token, the decoded payload, and the
 * request's abort signal, which fires when the client abandons the request.
 */
import type { Message, Update, UserFromGetMe } from 'grammy/types';
import type { BotRecord, Session } from './session_store.ts';
import { TelegramApiError } from './telegram_error.ts';

/** Decoded request parameters, regardless of whether they arrived as JSON, form data, or query. */
export type BotApiPayload = Record<string, unknown>;

export type BotApiMethod = (
  session: Session,
  bot: BotRecord,
  payload: BotApiPayload,
  signal: AbortSignal,
) => unknown;

export const botApiMethods: Readonly<Record<string, BotApiMethod>> = {
  getMe,
  sendMessage,
  deleteWebhook,
  getUpdates,
};

function getMe(_session: Session, bot: BotRecord): UserFromGetMe {
  return bot.user;
}

function sendMessage(session: Session, bot: BotRecord, payload: BotApiPayload): Message {
  if (payload.chat_id === undefined || payload.chat_id === null || payload.chat_id === '') {
    throw TelegramApiError.badRequest('chat_id is empty');
  }
  const text = parseMessageText(payload.text);
  const chatKey = toChatKey(payload.chat_id);
  const chat = chatKey === undefined ? undefined : session.chats.get(chatKey);
  if (chat === undefined) throw TelegramApiError.badRequest('chat not found');
  if (!chat.memberIds.has(bot.user.id)) {
    throw TelegramApiError.forbidden("bot can't initiate conversation with a user");
  }
  return session.appendTextMessage(chat, bot.user, text);
}

/** Stub: no webhook is ever registered, so there is nothing to delete and Telegram answers true. */
function deleteWebhook(): true {
  return true;
}

/**
 * Stub: no updates are ever produced. The long-poll contract is honored so that a polling bot idles
 * instead of spinning: the response is held for `timeout` seconds or until the client aborts the
 * request, then an empty batch is returned. Without a positive `timeout` the empty batch is
 * returned at once, which is Telegram's short polling. `offset` and the other parameters are
 * ignored until update generation exists.
 */
async function getUpdates(
  _session: Session,
  _bot: BotRecord,
  payload: BotApiPayload,
  signal: AbortSignal,
): Promise<Update[]> {
  const timeoutSeconds = Number(payload.timeout);
  if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
    await waitForTimeoutOrAbort(timeoutSeconds, signal);
  }
  return [];
}

function waitForTimeoutOrAbort(seconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, seconds * 1000);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Derives the chat map key from the wire value. Telegram accepts `chat_id` as an integer or as
 * a string, so a string is accepted only when it is exactly the decimal spelling of a number.
 * Anything else, including `@username` targets and other JSON types, yields no key and therefore
 * matches no chat. Ids are never validated: one that was not handed out cannot match anyway.
 */
function toChatKey(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && String(Number(value)) === value) return Number(value);
  return undefined;
}

function parseMessageText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw TelegramApiError.badRequest('message text is empty');
  }
  return value;
}
