import { z } from 'zod';

import { TELEGRAM_USER_ID_MAXIMUM } from './constants.ts';
import type {
  CreatedVirtualAccount,
  CreatedVirtualBot,
  EmulationSession,
  VirtualAccountProfile,
  VirtualBotProfile,
} from './types.ts';

const telegramUserIdSchema = z.number().int().min(1).max(TELEGRAM_USER_ID_MAXIMUM);

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

export const createdVirtualAccountSchema: z.ZodType<CreatedVirtualAccount> = z.strictObject({
  account: virtualAccountProfileSchema,
});

export const getMeResponseSchema = z.strictObject({
  ok: z.literal(true),
  result: virtualBotProfileSchema,
});
