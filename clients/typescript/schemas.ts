import { z } from 'zod';

import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from './constants.ts';
import type {
  CallbackQuery,
  CreatedVirtualBot,
  EmulationSession,
  InlineKeyboardMarkup,
  MessageSenderBot,
  PrivateTextMessage,
  VirtualAccountProfile,
  VirtualBotProfile,
} from './types.ts';

interface CreatedVirtualAccountResponse {
  readonly account: VirtualAccountProfile;
}

const telegramUserIdSchema = z.number().int()
  .min(MIN_TELEGRAM_USER_ID)
  .max(MAX_TELEGRAM_USER_ID);

export const virtualBotProfileSchema: z.ZodType<VirtualBotProfile> = z.strictObject({
  id: telegramUserIdSchema,
  is_bot: z.literal(true),
  first_name: z.string(),
  username: z.string(),
  can_join_groups: z.boolean(),
  can_read_all_group_messages: z.boolean(),
  supports_guest_queries: z.boolean().optional(),
  supports_inline_queries: z.boolean(),
  can_connect_to_business: z.boolean(),
  has_main_web_app: z.boolean(),
  has_topics_enabled: z.boolean(),
  allows_users_to_create_topics: z.boolean(),
  can_manage_bots: z.boolean(),
  supports_join_request_queries: z.boolean(),
});

export const virtualAccountProfileSchema: z.ZodType<VirtualAccountProfile> = z.strictObject({
  id: telegramUserIdSchema,
  is_bot: z.literal(false),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
});

export const emulationSessionSchema: z.ZodType<EmulationSession> = z.strictObject({
  id: z.uuid(),
  botApiRoot: z.url(),
});

export const createdVirtualBotSchema: z.ZodType<CreatedVirtualBot> = z.strictObject({
  token: z.string().min(1),
  bot: virtualBotProfileSchema,
});

export const createdVirtualAccountSchema: z.ZodType<CreatedVirtualAccountResponse> = z.strictObject(
  {
    account: virtualAccountProfileSchema,
  },
);

export const getMeResponseSchema = z.strictObject({
  ok: z.literal(true),
  result: virtualBotProfileSchema,
});

const messageSenderBotSchema: z.ZodType<MessageSenderBot> = z.strictObject({
  id: telegramUserIdSchema,
  is_bot: z.literal(true),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string(),
});

const privateChatSchema = z.strictObject({
  id: telegramUserIdSchema,
  type: z.literal('private'),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

const messageEntitySchema = z.strictObject({
  type: z.literal('bot_command'),
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
});

const inlineKeyboardMarkupSchema: z.ZodType<InlineKeyboardMarkup> = z.strictObject({
  inline_keyboard: z.array(
    z.array(
      z.union([
        z.strictObject({ text: z.string(), callback_data: z.string() }),
        z.strictObject({ text: z.string(), url: z.string() }),
      ]),
    ).min(1),
  ).min(1),
});

export const privateTextMessageSchema: z.ZodType<PrivateTextMessage> = z.strictObject({
  message_id: z.number().int().positive(),
  from: z.union([virtualAccountProfileSchema, messageSenderBotSchema]),
  chat: privateChatSchema,
  date: z.number().int().nonnegative(),
  edit_date: z.number().int().nonnegative().optional(),
  text: z.string(),
  entities: z.array(messageEntitySchema).min(1).optional(),
  reply_markup: inlineKeyboardMarkupSchema.optional(),
});

export const sentMessageResponseSchema = z.strictObject({
  message: privateTextMessageSchema,
});

export const messageHistoryResponseSchema = z.strictObject({
  messages: z.array(privateTextMessageSchema),
});

const callbackQuerySchema: z.ZodType<CallbackQuery> = z.strictObject({
  id: z.string().min(1),
  callback_data: z.string(),
  status: z.enum(['awaiting_answer', 'answered', 'expired']),
  answer: z.strictObject({
    text: z.string().optional(),
    show_alert: z.boolean(),
    cache_time: z.number().int().nonnegative(),
  }).nullable(),
});

export const callbackQueryResponseSchema = z.strictObject({
  callback_query: callbackQuerySchema,
});
