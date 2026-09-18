/**
 * Implementations of the emulated Telegram Bot API methods. Each method receives the session the
 * request was routed to, the bot identified by the request token, and the decoded payload.
 */
import type { Message, UserFromGetMe } from 'grammy/types';
import type { BotRecord, Session } from './session_store.ts';
import { TelegramApiError } from './telegram_error.ts';

/** Decoded request parameters, regardless of whether they arrived as JSON, form data, or query. */
export type BotApiPayload = Record<string, unknown>;

export type BotApiMethod = (session: Session, bot: BotRecord, payload: BotApiPayload) => unknown;

export const botApiMethods: Readonly<Record<string, BotApiMethod>> = {
  getMe,
  sendMessage,
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
