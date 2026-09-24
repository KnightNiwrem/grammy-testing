import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import type { BotCommand } from '../../../types/bot_command.ts';
import type { CallbackQuery } from '../../../types/callback_query.ts';
import type { ReplyInterface } from '../../../types/reply_interface.ts';
import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from '../../../types/telegram_identity.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../../../types/virtual_message.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const ACCOUNT_ID_PARAMETER = 'accountId';
const BOT_ID_PARAMETER = 'botId';
const ACCOUNT_MESSAGE_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/messages` as const;
const PRIVATE_CONVERSATION_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/conversations/private/:${BOT_ID_PARAMETER}` as const;
const PRIVATE_MESSAGE_HISTORY_PATH = `${PRIVATE_CONVERSATION_PATH}/messages` as const;
const PRIVATE_CHAT_COMMANDS_PATH = `${PRIVATE_CONVERSATION_PATH}/commands` as const;
const PRIVATE_CHAT_REPLY_INTERFACE_PATH = `${PRIVATE_CONVERSATION_PATH}/reply-interface` as const;
const REPLY_KEYBOARD_PRESS_COLLECTION_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/reply-keyboard-presses` as const;
const CALLBACK_QUERY_ID_PARAMETER = 'callbackQueryId';
const CALLBACK_QUERY_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/callback-queries` as const;
const CALLBACK_QUERY_PATH =
  `${CALLBACK_QUERY_COLLECTION_PATH}/:${CALLBACK_QUERY_ID_PARAMETER}` as const;

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
  /** The replied message's ID as the bot sees it, which is how these routes show messages. */
  reply_to_message_id: z.int().positive().optional(),
});

const pressReplyKeyboardButtonRequestSchema = z.strictObject({
  chat: z.strictObject({
    type: z.literal('private'),
    botId: telegramUserIdSchema,
  }),
  text: z.string().min(1),
});

const pressCallbackButtonRequestSchema = z.strictObject({
  chat: z.strictObject({
    type: z.literal('private'),
    botId: telegramUserIdSchema,
  }),
  /** The message's ID as the bot sees it, which is how these routes show messages. */
  message_id: z.int().positive(),
  callback_data: z.string().min(1),
  expired: z.boolean().default(false),
});

/**
 * Account-facing routes. Private messages they return are shown as the conversation's bot sees
 * them, whichever participant wrote them.
 */
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

    const { privateMessaging, botMessageViews } = context.get('emulationSession');
    const { to, text, reply_to_message_id: replyToBotMessageId } = parsedRequest.data;
    const result = privateMessaging.sendAccountMessage({
      fromAccountId: accountId.data,
      to,
      text,
      replyToBotMessageId,
    });
    if (!result.sent) {
      return context.body(
        null,
        result.reason === 'account_not_found' || result.reason === 'bot_not_found' ? 404 : 400,
      );
    }

    return context.json(
      { message: botMessageViews.viewPrivateTextMessageForBot(result.message) },
      201,
    );
  });

  accountRoutes.get(PRIVATE_MESSAGE_HISTORY_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const { privateMessaging, botMessageViews } = context.get('emulationSession');
    const result = privateMessaging.getPrivateMessageHistory({
      accountId: accountId.data,
      botId: botId.data,
    });
    if (!result.found) {
      return context.body(null, 404);
    }

    return context.json({
      messages: result.messages.map((message) =>
        botMessageViews.viewPrivateTextMessageForBot(message)
      ),
    });
  });

  accountRoutes.get(PRIVATE_CHAT_COMMANDS_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').botCommands.getPrivateChatCommands({
      accountId: accountId.data,
      botId: botId.data,
    });
    if (!result.found) {
      return context.body(null, 404);
    }
    return context.json({ commands: result.commands.map(presentBotCommandForAccount) });
  });

  accountRoutes.get(PRIVATE_CHAT_REPLY_INTERFACE_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const { privateMessaging, botMessageViews } = context.get('emulationSession');
    const result = privateMessaging.getPrivateChatReplyInterface({
      accountId: accountId.data,
      botId: botId.data,
    });
    if (!result.found) {
      return context.body(null, 404);
    }
    const { shownReplyInterface } = result;
    return context.json({
      reply_interface: shownReplyInterface === undefined ? null : presentReplyInterfaceForAccount(
        botMessageViews.viewPrivateTextMessageForBot(shownReplyInterface.message).message_id,
        shownReplyInterface.replyInterface,
      ),
    });
  });

  accountRoutes.post(REPLY_KEYBOARD_PRESS_COLLECTION_PATH, async (context) => {
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
    const parsedRequest = pressReplyKeyboardButtonRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const { privateMessaging, botMessageViews } = context.get('emulationSession');
    const result = privateMessaging.pressReplyKeyboardButton({
      fromAccountId: accountId.data,
      chat: parsedRequest.data.chat,
      text: parsedRequest.data.text,
    });
    if (!result.sent) {
      return context.body(
        null,
        result.reason === 'account_not_found' || result.reason === 'bot_not_found' ? 404 : 400,
      );
    }
    return context.json(
      { message: botMessageViews.viewPrivateTextMessageForBot(result.message) },
      201,
    );
  });

  accountRoutes.post(CALLBACK_QUERY_COLLECTION_PATH, async (context) => {
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
    const parsedRequest = pressCallbackButtonRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').callbackQueries.pressCallbackButton({
      fromAccountId: accountId.data,
      chat: parsedRequest.data.chat,
      botMessageId: parsedRequest.data.message_id,
      callbackData: parsedRequest.data.callback_data,
      expired: parsedRequest.data.expired,
    });
    if (!result.pressed) {
      return context.body(null, result.reason === 'callback_button_not_found' ? 400 : 404);
    }

    const callbackQueryPath = `${
      basePath(context)
    }/${accountId.data}/callback-queries/${result.callbackQuery.id}`;
    return context.json(
      { callback_query: presentCallbackQueryForAccount(result.callbackQuery) },
      201,
      { Location: callbackQueryPath },
    );
  });

  accountRoutes.get(CALLBACK_QUERY_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    if (!accountId.success) {
      return context.body(null, 400);
    }

    const callbackQuery = context.get('emulationSession').callbackQueries.getAccountCallbackQuery({
      accountId: accountId.data,
      callbackQueryId: context.req.param(CALLBACK_QUERY_ID_PARAMETER),
    });
    if (callbackQuery === undefined) {
      return context.body(null, 404);
    }
    return context.json({ callback_query: presentCallbackQueryForAccount(callbackQuery) });
  });

  return accountRoutes;
}

/** Shows a command as the account's client lists it. */
function presentBotCommandForAccount({ command, description, isEphemeral }: BotCommand) {
  return { command, description, is_ephemeral: isEphemeral };
}

/**
 * Shows the reply interface the account's client shows, with the ID, as the bot sees it, of the
 * message that asked for it.
 */
function presentReplyInterfaceForAccount(messageId: number, replyInterface: ReplyInterface) {
  const placeholder = replyInterface.inputFieldPlaceholder === undefined
    ? {}
    : { input_field_placeholder: replyInterface.inputFieldPlaceholder };
  switch (replyInterface.kind) {
    case 'reply_keyboard':
      return {
        type: 'keyboard' as const,
        message_id: messageId,
        keyboard: replyInterface.rows.map((row) => row.map(({ text }) => ({ text }))),
        is_persistent: replyInterface.isPersistent,
        resize_keyboard: replyInterface.resizesToFit,
        one_time_keyboard: replyInterface.isOneTime,
        ...placeholder,
      };
    case 'forced_reply':
      return { type: 'force_reply' as const, message_id: messageId, ...placeholder };
    default: {
      const unhandledReplyInterface: never = replyInterface;
      throw new Error(`Unhandled reply interface: ${JSON.stringify(unhandledReplyInterface)}`);
    }
  }
}

/** Shows a callback query to the account that created it, with the bot's answer once given. */
function presentCallbackQueryForAccount({ id, callbackData, state }: CallbackQuery) {
  return {
    id,
    callback_data: callbackData,
    status: state.status,
    answer: state.status !== 'answered' ? null : {
      ...(state.answer.text === undefined ? {} : { text: state.answer.text }),
      show_alert: state.answer.showAlert,
      cache_time: state.answer.cacheTimeSeconds,
    },
  };
}
