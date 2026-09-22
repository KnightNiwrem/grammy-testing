import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from '../../../types/telegram_identity.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../../../types/virtual_message.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const ACCOUNT_ID_PARAMETER = 'accountId';
const BOT_ID_PARAMETER = 'botId';
const ACCOUNT_MESSAGE_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/messages` as const;
const PRIVATE_MESSAGE_HISTORY_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/conversations/private/:${BOT_ID_PARAMETER}/messages` as const;

const telegramUserIdSchema = z.number().int()
  .min(MIN_TELEGRAM_USER_ID)
  .max(MAX_TELEGRAM_USER_ID);
const telegramUserIdPathParameterSchema = z.coerce.number().pipe(telegramUserIdSchema);

const createAccountRequestSchema = z.strictObject({
  first_name: z.string().min(1),
  last_name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  language_code: z.string().min(1).optional(),
});

const sendMessageRequestSchema = z.strictObject({
  to: z.strictObject({
    type: z.literal('private'),
    botId: telegramUserIdSchema,
  }),
  text: z.string().min(1).max(MAX_TEXT_MESSAGE_LENGTH),
});

export function createAccountRoutes(): Hono<SessionRouteContextTypes> {
  const accountRoutes = new Hono<SessionRouteContextTypes>();

  accountRoutes.post('/', async (context) => {
    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }

    const parsedRequest = createAccountRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').virtualUsers.createAccount(parsedRequest.data);
    if (!result.created) {
      return context.body(null, result.reason === 'username_taken' ? 409 : 507);
    }

    const accountPath = `${basePath(context)}/${result.account.profile.id}`;
    return context.json(
      { account: result.account.profile },
      201,
      { Location: accountPath },
    );
  });

  accountRoutes.post(ACCOUNT_MESSAGE_COLLECTION_PATH, async (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    if (!accountId.success) {
      return context.body(null, 400);
    }

    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }
    const parsedRequest = sendMessageRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').chatInteractions.sendMessage({
      fromAccountId: accountId.data,
      ...parsedRequest.data,
    });
    if (!result.sent) {
      return context.body(
        null,
        result.reason === 'account_not_found' || result.reason === 'bot_not_found' ? 404 : 400,
      );
    }

    return context.json({ message: result.message }, 201);
  });

  accountRoutes.get(PRIVATE_MESSAGE_HISTORY_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').chatInteractions.getPrivateMessageHistory({
      accountId: accountId.data,
      botId: botId.data,
    });
    if (!result.found) {
      return context.body(null, 404);
    }

    return context.json({ messages: result.messages });
  });

  return accountRoutes;
}
