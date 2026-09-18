/**
 * Request and response shapes of the emulation server's admin API, shared by the server routes
 * and the test client so that both sides agree on one contract.
 */
import type { Chat, Message, User, UserFromGetMe } from 'grammy/types';

/** URL path segment under which the admin API lives. */
export const ADMIN_PATH_PREFIX = '/admin';
/** URL path segment under which every session's emulated Bot API lives. */
export const BOT_API_PATH_PREFIX = '/bot-api';

/** Builds the API root a bot must use to reach the given session's emulated Bot API. */
export function buildSessionApiRoot(serverOrigin: string, sessionId: string): string {
  return `${serverOrigin}${BOT_API_PATH_PREFIX}/${sessionId}`;
}

export interface CreateSessionResponse {
  sessionId: string;
  /** Base URL to pass to the bot instead of `https://api.telegram.org`. */
  apiRoot: string;
}

export interface CreateBotRequest {
  username: string;
  first_name: string;
}

export interface CreateBotResponse {
  /** Bot token in Telegram's `<bot id>:<secret>` format. */
  token: string;
  user: UserFromGetMe;
}

export interface CreateUserRequest {
  /** Explicit identifier; the server draws a random one when omitted. */
  id?: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export type CreateUserResponse = User;

export interface CreatePrivateChatRequest {
  type: 'private';
  /** The human party of the private chat; its name fields become the chat's name fields. */
  user_id: number;
  /** Identifiers of every user (including bots) that is a member from the start. */
  member_ids: number[];
}

export type CreateChatRequest = CreatePrivateChatRequest;

export interface ChatResponse {
  chat: Chat;
  member_ids: number[];
}

export interface ListMessagesQuery {
  /** Only messages sent by this user or bot. */
  from_id?: number;
}

export type ListMessagesResponse = Message[];

export interface AdminErrorResponse {
  error: string;
}
