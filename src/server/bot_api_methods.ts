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
 * request, then an empty batch is returned. A `timeout` of 0, or none at all, returns the empty
 * batch at once, which is Telegram's short polling. `offset` and the other parameters are ignored
 * until update generation exists.
 */
function getUpdates(
  session: Session,
  _bot: BotRecord,
  payload: BotApiPayload,
  signal: AbortSignal,
): Promise<Update[]> {
  return session.waitForUpdates(parsePollTimeoutSeconds(payload.timeout), signal);
}

/** Telegram integers are 32-bit unless documented otherwise; `timeout` is not documented otherwise. */
const MAX_POLL_TIMEOUT_SECONDS = 2 ** 31 - 1;

/**
 * grammY sends `timeout` as a JSON number. A string is accepted only when it is exactly the decimal
 * spelling of a number, the same rule as `toChatKey`, so that query and form inputs work. Because
 * this is a testing library, anything else is a client error rather than a lenient default: a bot
 * that sends a malformed timeout should learn about it.
 */
function parsePollTimeoutSeconds(value: unknown): number {
  if (value === undefined) return 0;
  const seconds = typeof value === 'number'
    ? value
    : typeof value === 'string' && String(Number(value)) === value
    ? Number(value)
    : NaN;
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_POLL_TIMEOUT_SECONDS) {
    throw TelegramApiError.badRequest(
      `timeout must be an integer between 0 and ${MAX_POLL_TIMEOUT_SECONDS}`,
    );
  }
  return seconds;
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
