import { z } from 'zod';

import {
  MAX_SUPERGROUP_OR_CHANNEL_ID,
  MAX_TELEGRAM_USER_ID,
  MIN_SUPERGROUP_OR_CHANNEL_ID,
  MIN_TELEGRAM_USER_ID,
} from './constants.ts';
import type {
  CallbackQuery,
  CreatedVirtualBot,
  EmulationSession,
  InlineKeyboardMarkup,
  MessageEntity,
  MessageSenderBot,
  PlainMessageEntityType,
  PrivateTextMessage,
  ReplyInterface,
  Supergroup,
  SupergroupTextMessage,
  VirtualAccountProfile,
  VirtualBotProfile,
} from './types.ts';

interface CreatedVirtualAccountResponse {
  readonly account: VirtualAccountProfile;
}

const telegramUserIdSchema = z.number().int()
  .min(MIN_TELEGRAM_USER_ID)
  .max(MAX_TELEGRAM_USER_ID);

const supergroupIdSchema = z.number().int()
  .min(MIN_SUPERGROUP_OR_CHANNEL_ID)
  .max(MAX_SUPERGROUP_OR_CHANNEL_ID);

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

const supergroupChatSchema = z.strictObject({
  id: supergroupIdSchema,
  title: z.string(),
  type: z.literal('supergroup'),
});

const messageEntitySpanShape = {
  offset: z.number().int().nonnegative(),
  length: z.number().int().positive(),
};

const messageEntitySchema: z.ZodType<MessageEntity> = z.union([
  z.strictObject({
    type: z.enum(
      [
        'bot_command',
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'spoiler',
        'code',
        'blockquote',
        'expandable_blockquote',
      ] satisfies PlainMessageEntityType[],
    ),
    ...messageEntitySpanShape,
  }),
  z.strictObject({
    type: z.literal('pre'),
    ...messageEntitySpanShape,
    language: z.string().min(1).optional(),
  }),
  z.strictObject({ type: z.literal('text_link'), ...messageEntitySpanShape, url: z.string() }),
  z.strictObject({
    type: z.literal('text_mention'),
    ...messageEntitySpanShape,
    user: z.union([virtualAccountProfileSchema, messageSenderBotSchema]),
  }),
  z.strictObject({
    type: z.literal('custom_emoji'),
    ...messageEntitySpanShape,
    custom_emoji_id: z.string().regex(/^-?\d+$/),
  }),
]);

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

/** The fields that precede a message's reply, for a chat of the given schema. */
function messageHeaderShape<Chat extends z.ZodType>(chat: Chat) {
  return {
    message_id: z.number().int().positive(),
    from: z.union([virtualAccountProfileSchema, messageSenderBotSchema]),
    chat,
    date: z.number().int().nonnegative(),
    edit_date: z.number().int().nonnegative().optional(),
  };
}

const messageContentShape = {
  text: z.string(),
  entities: z.array(messageEntitySchema).min(1).optional(),
  reply_markup: inlineKeyboardMarkupSchema.optional(),
  has_protected_content: z.literal(true).optional(),
};

/** Fields in the order the server sends them, with a reply between header and content. */
function textMessageSchema<Chat extends z.ZodType>(chat: Chat) {
  return z.strictObject({
    ...messageHeaderShape(chat),
    reply_to_message: z.strictObject({ ...messageHeaderShape(chat), ...messageContentShape })
      .optional(),
    ...messageContentShape,
  });
}

export const privateTextMessageSchema: z.ZodType<PrivateTextMessage> = textMessageSchema(
  privateChatSchema,
);

const supergroupTextMessageSchema: z.ZodType<SupergroupTextMessage> = textMessageSchema(
  supergroupChatSchema,
);

export const sentMessageResponseSchema = z.strictObject({
  message: privateTextMessageSchema,
});

export const messageHistoryResponseSchema = z.strictObject({
  messages: z.array(privateTextMessageSchema),
});

export const sentSupergroupMessageResponseSchema = z.strictObject({
  message: supergroupTextMessageSchema,
});

export const supergroupMessageHistoryResponseSchema = z.strictObject({
  messages: z.array(supergroupTextMessageSchema),
});

const supergroupSchema: z.ZodType<Supergroup> = z.strictObject({
  id: supergroupIdSchema,
  type: z.literal('supergroup'),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const createdSupergroupResponseSchema = z.strictObject({
  supergroup: supergroupSchema,
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

export const botCommandsResponseSchema = z.strictObject({
  commands: z.array(z.strictObject({
    command: z.string().min(1),
    description: z.string().min(1),
    is_ephemeral: z.boolean(),
  })),
});

const replyInterfaceSchema: z.ZodType<ReplyInterface> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('keyboard'),
    message_id: z.number().int().positive(),
    keyboard: z.array(z.array(z.strictObject({ text: z.string().min(1) })).min(1)).min(1),
    is_persistent: z.boolean(),
    resize_keyboard: z.boolean(),
    one_time_keyboard: z.boolean(),
    input_field_placeholder: z.string().min(1).optional(),
  }),
  z.strictObject({
    type: z.literal('force_reply'),
    message_id: z.number().int().positive(),
    input_field_placeholder: z.string().min(1).optional(),
  }),
]);

export const replyInterfaceResponseSchema = z.strictObject({
  reply_interface: replyInterfaceSchema.nullable(),
});

export const callbackQueryResponseSchema = z.strictObject({
  callback_query: callbackQuerySchema,
});
