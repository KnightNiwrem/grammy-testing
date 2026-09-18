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
  const chatId = parseChatId(payload.chat_id);
  const text = parseMessageText(payload.text);
  const chat = session.chats.get(chatId);
  if (chat === undefined) throw TelegramApiError.badRequest('chat not found');
  if (!chat.memberIds.has(bot.user.id)) {
    throw TelegramApiError.forbidden("bot can't initiate conversation with a user");
  }
  return session.appendTextMessage(chat, bot.user, text);
}

/** Accepts the integer or numeric-string forms Telegram allows; usernames resolve to no chat. */
function parseChatId(value: unknown): number {
  if (value === undefined || value === '') throw TelegramApiError.badRequest('chat_id is empty');
  const chatId = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(chatId)) throw TelegramApiError.badRequest('chat not found');
  return chatId;
}

function parseMessageText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw TelegramApiError.badRequest('message text is empty');
  }
  return value;
}
