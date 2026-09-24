import { Hono } from 'hono';
import { basePath } from 'hono/route';
import { z } from 'zod';

import type { BotCommand } from '../../../types/bot_command.ts';
import type { CallbackQuery } from '../../../types/callback_query.ts';
import type { EmulationSession } from '../../../types/emulation_session.ts';
import type { ReplyInterface } from '../../../types/reply_interface.ts';
import {
  MAX_SUPERGROUP_OR_CHANNEL_ID,
  MAX_TELEGRAM_USER_ID,
  MIN_SUPERGROUP_OR_CHANNEL_ID,
  MIN_TELEGRAM_USER_ID,
} from '../../../types/telegram_identity.ts';
import type { Supergroup } from '../../../types/virtual_chat.ts';
import { MAX_TEXT_MESSAGE_LENGTH } from '../../../types/virtual_message.ts';
import type { SessionRouteContextTypes } from '../session_route_context_types.ts';

const ACCOUNT_ID_PARAMETER = 'accountId';
const BOT_ID_PARAMETER = 'botId';
const ACCOUNT_MESSAGE_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/messages` as const;
const PRIVATE_CONVERSATION_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/conversations/private/:${BOT_ID_PARAMETER}` as const;
const PRIVATE_MESSAGE_HISTORY_PATH = `${PRIVATE_CONVERSATION_PATH}/messages` as const;
const MESSAGE_ID_PARAMETER = 'messageId';
const PRIVATE_MESSAGE_PATH = `${PRIVATE_MESSAGE_HISTORY_PATH}/:${MESSAGE_ID_PARAMETER}` as const;
const BLOCKED_BOT_PATH = `/:${ACCOUNT_ID_PARAMETER}/blocked-bots/:${BOT_ID_PARAMETER}` as const;
const PRIVATE_CHAT_COMMANDS_PATH = `${PRIVATE_CONVERSATION_PATH}/commands` as const;
const PRIVATE_CHAT_REPLY_INTERFACE_PATH = `${PRIVATE_CONVERSATION_PATH}/reply-interface` as const;
const REPLY_KEYBOARD_PRESS_COLLECTION_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/reply-keyboard-presses` as const;
const CALLBACK_QUERY_ID_PARAMETER = 'callbackQueryId';
const CALLBACK_QUERY_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/callback-queries` as const;
const CALLBACK_QUERY_PATH =
  `${CALLBACK_QUERY_COLLECTION_PATH}/:${CALLBACK_QUERY_ID_PARAMETER}` as const;
const SUPERGROUP_COLLECTION_PATH = `/:${ACCOUNT_ID_PARAMETER}/supergroups` as const;
const CHAT_ID_PARAMETER = 'chatId';
const SUPERGROUP_CONVERSATION_PATH =
  `/:${ACCOUNT_ID_PARAMETER}/conversations/supergroup/:${CHAT_ID_PARAMETER}` as const;
const SUPERGROUP_MESSAGE_HISTORY_PATH = `${SUPERGROUP_CONVERSATION_PATH}/messages` as const;
const SUPERGROUP_MESSAGE_PATH =
  `${SUPERGROUP_MESSAGE_HISTORY_PATH}/:${MESSAGE_ID_PARAMETER}` as const;
const USER_ID_PARAMETER = 'userId';
const SUPERGROUP_MEMBER_PATH =
  `${SUPERGROUP_CONVERSATION_PATH}/members/:${USER_ID_PARAMETER}` as const;

const telegramUserIdSchema = z.number().int()
  .min(MIN_TELEGRAM_USER_ID)
  .max(MAX_TELEGRAM_USER_ID);
const telegramUserIdPathParameterSchema = z.coerce.number().pipe(telegramUserIdSchema);
const supergroupChatIdSchema = z.number().int()
  .min(MIN_SUPERGROUP_OR_CHANNEL_ID)
  .max(MAX_SUPERGROUP_OR_CHANNEL_ID);
const supergroupChatIdPathParameterSchema = z.coerce.number().pipe(supergroupChatIdSchema);
/** The path parameters of a supergroup member as an account addresses it. */
const supergroupMemberPathSchema = z.object({
  [ACCOUNT_ID_PARAMETER]: telegramUserIdPathParameterSchema,
  [CHAT_ID_PARAMETER]: supergroupChatIdPathParameterSchema,
  [USER_ID_PARAMETER]: telegramUserIdPathParameterSchema,
});
/** A message's ID as the chat's bots see it, which is how these routes show messages. */
const messageIdPathParameterSchema = z.coerce.number().pipe(z.int().positive());

/**
 * The chat a message goes to or a button is on: a private chat with a bot, or a supergroup the
 * account is a member of.
 */
const chatSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('private'), botId: telegramUserIdSchema }),
  z.strictObject({ type: z.literal('supergroup'), chatId: supergroupChatIdSchema }),
]);

const createAccountRequestSchema = z.strictObject({
  first_name: z.string().min(1),
  last_name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  language_code: z.string().min(1).optional(),
});

/** A file's content, which JSON carries as base64 text. */
const base64ContentSchema = z.string().transform((base64Text, context) => {
  try {
    return Uint8Array.fromBase64(base64Text);
  } catch {
    context.issues.push({ code: 'custom', message: 'Expected base64 text', input: base64Text });
    return z.NEVER;
  }
});

const sentMessageTargetShape = {
  to: chatSchema,
  /** The replied message's ID as the chat's bots see it, which is how these routes show messages. */
  reply_to_message_id: z.int().positive().optional(),
};

/** A caption, which Telegram's service limits, so its length is checked when sending. */
const captionSchema = z.string().default('');

/** A text message, a photo, or a document, each with an optional caption. */
const sendMessageRequestSchema = z.union([
  z.strictObject({
    ...sentMessageTargetShape,
    text: z.string().min(1).max(MAX_TEXT_MESSAGE_LENGTH),
  }),
  z.strictObject({
    ...sentMessageTargetShape,
    photo: z.strictObject({ content_base64: base64ContentSchema }),
    caption: captionSchema,
  }),
  z.strictObject({
    ...sentMessageTargetShape,
    document: z.strictObject({
      content_base64: base64ContentSchema,
      file_name: z.string().min(1),
    }),
    caption: captionSchema,
  }),
]);

const createSupergroupRequestSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});

/** New text for a text message, or a new caption for a photo or document; empty removes it. */
const editMessageRequestSchema = z.union([
  z.strictObject({ text: z.string().min(1).max(MAX_TEXT_MESSAGE_LENGTH) }),
  z.strictObject({ caption: z.string() }),
]);

const pressReplyKeyboardButtonRequestSchema = z.strictObject({
  chat: z.strictObject({
    type: z.literal('private'),
    botId: telegramUserIdSchema,
  }),
  text: z.string().min(1),
});

const pressCallbackButtonRequestSchema = z.strictObject({
  chat: chatSchema,
  /** The message's ID as the chat's bots see it, which is how these routes show messages. */
  message_id: z.int().positive(),
  callback_data: z.string().min(1),
  expired: z.boolean().default(false),
});

/**
 * Account-facing routes. Private messages they return are shown as the conversation's bot sees
 * them, whichever participant wrote them. Supergroup messages are shown as the requesting account
 * sees them, which differs from what other members see only in the `file_id` of a file and the
 * legacy `new_chat_member` of a service message.
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

    const { privateMessaging, supergroupMessaging, botMessageViews, mediaFiles } = context.get(
      'emulationSession',
    );
    const content = readAccountMessageContent(parsedRequest.data, mediaFiles);
    if (content === undefined) {
      return context.body(null, 400);
    }
    const { to, reply_to_message_id: replyToMessageId } = parsedRequest.data;
    if (to.type === 'supergroup') {
      const result = supergroupMessaging.sendAccountMessage({
        fromAccountId: accountId.data,
        chatId: to.chatId,
        content,
        replyToMessageId,
      });
      if (!result.sent) {
        return context.body(null, supergroupMemberFailureStatus(result.reason));
      }
      return context.json(
        { message: botMessageViews.viewSupergroupMessage(result.message, accountId.data) },
        201,
      );
    }

    const result = privateMessaging.sendAccountMessage({
      fromAccountId: accountId.data,
      to,
      content,
      replyToBotMessageId: replyToMessageId,
    });
    if (!result.sent) {
      return context.body(null, accountMessageFailureStatus(result.reason));
    }

    return context.json(
      { message: botMessageViews.viewPrivateMessageForBot(result.message) },
      201,
    );
  });

  accountRoutes.post(SUPERGROUP_COLLECTION_PATH, async (context) => {
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
    const parsedRequest = createSupergroupRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').sharedChatAdministration.createSupergroup({
      creatorAccountId: accountId.data,
      title: parsedRequest.data.title,
      description: parsedRequest.data.description,
    });
    if (!result.created) {
      return context.body(null, result.reason === 'creator_account_not_found' ? 404 : 507);
    }
    return context.json({ supergroup: presentSupergroup(result.supergroup) }, 201);
  });

  accountRoutes.put(SUPERGROUP_MEMBER_PATH, (context) => {
    const memberPath = supergroupMemberPathSchema.safeParse(context.req.param());
    if (!memberPath.success) {
      return context.body(null, 400);
    }
    const { accountId, chatId, userId } = memberPath.data;

    const result = context.get('emulationSession').sharedChatAdministration.addChatMember({
      actorAccountId: accountId,
      chatId,
      memberId: userId,
    });
    if (result.added) {
      return context.body(null, 204);
    }
    switch (result.reason) {
      // Adding a member again changes nothing, as a repeated PUT should.
      case 'member_already_present':
        return context.body(null, 204);
      case 'actor_not_authorized':
        return context.body(null, 403);
      case 'actor_account_not_found':
      case 'chat_not_found':
      case 'member_not_found':
        return context.body(null, 404);
      // Only supergroups are addressed here, and they accept bots.
      case 'bot_not_permitted_in_channel':
        throw new Error(`Supergroup ${chatId} refused bot ${userId} as a channel`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled chat member addition failure: ${unhandledReason}`);
      }
    }
  });

  // The account leaves when it names itself, and otherwise removes the member as the owner.
  accountRoutes.delete(SUPERGROUP_MEMBER_PATH, (context) => {
    const memberPath = supergroupMemberPathSchema.safeParse(context.req.param());
    if (!memberPath.success) {
      return context.body(null, 400);
    }
    const { accountId, chatId, userId } = memberPath.data;

    const { sharedChatAdministration } = context.get('emulationSession');
    if (userId === accountId) {
      const result = sharedChatAdministration.leaveChat({
        memberId: accountId,
        chatId,
      });
      if (result.left) {
        return context.body(null, 204);
      }
      switch (result.reason) {
        // Leaving again changes nothing, as a repeated DELETE should.
        case 'not_a_member':
          return context.body(null, 204);
        case 'member_not_found':
        case 'chat_not_found':
          return context.body(null, 404);
        case 'owner_cannot_leave':
          return context.body(null, 409);
        default: {
          const unhandledReason: never = result.reason;
          throw new Error(`Unhandled chat leaving failure: ${unhandledReason}`);
        }
      }
    }

    const result = sharedChatAdministration.removeChatMember({
      actorAccountId: accountId,
      chatId,
      memberId: userId,
    });
    if (result.removed) {
      return context.body(null, 204);
    }
    switch (result.reason) {
      // Removing a member again changes nothing, as a repeated DELETE should.
      case 'not_a_member':
        return context.body(null, 204);
      case 'actor_not_authorized':
        return context.body(null, 403);
      case 'actor_account_not_found':
      case 'chat_not_found':
      case 'member_not_found':
        return context.body(null, 404);
      // A chat has one owner, and an owner naming itself leaves instead.
      case 'member_is_owner':
        throw new Error(`Supergroup ${chatId} has an owner besides ${accountId}`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled chat member removal failure: ${unhandledReason}`);
      }
    }
  });

  accountRoutes.get(SUPERGROUP_MESSAGE_HISTORY_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const chatId = supergroupChatIdPathParameterSchema.safeParse(
      context.req.param(CHAT_ID_PARAMETER),
    );
    if (!accountId.success || !chatId.success) {
      return context.body(null, 400);
    }

    const { supergroupMessaging, botMessageViews } = context.get('emulationSession');
    const result = supergroupMessaging.getMessageHistory({
      accountId: accountId.data,
      chatId: chatId.data,
    });
    if (!result.found) {
      return context.body(null, supergroupMemberFailureStatus(result.reason));
    }
    return context.json({
      messages: result.messages.map((message) =>
        botMessageViews.viewSupergroupMessage(message, accountId.data)
      ),
    });
  });

  accountRoutes.patch(SUPERGROUP_MESSAGE_PATH, async (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const chatId = supergroupChatIdPathParameterSchema.safeParse(
      context.req.param(CHAT_ID_PARAMETER),
    );
    const messageId = messageIdPathParameterSchema.safeParse(
      context.req.param(MESSAGE_ID_PARAMETER),
    );
    if (!accountId.success || !chatId.success || !messageId.success) {
      return context.body(null, 400);
    }

    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }
    const parsedRequest = editMessageRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const { supergroupMessaging, botMessageViews } = context.get('emulationSession');
    const result = supergroupMessaging.editAccountMessage({
      fromAccountId: accountId.data,
      chatId: chatId.data,
      messageId: messageId.data,
      edit: readAccountMessageEdit(parsedRequest.data),
    });
    if (!result.edited) {
      return context.body(null, supergroupMemberFailureStatus(result.reason));
    }
    return context.json({
      message: botMessageViews.viewSupergroupMessage(result.message, accountId.data),
    });
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
      messages: result.messages.map((message) => botMessageViews.viewPrivateMessageForBot(message)),
    });
  });

  accountRoutes.patch(PRIVATE_MESSAGE_PATH, async (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    const messageId = messageIdPathParameterSchema.safeParse(
      context.req.param(MESSAGE_ID_PARAMETER),
    );
    if (!accountId.success || !botId.success || !messageId.success) {
      return context.body(null, 400);
    }

    let requestBody: unknown;
    try {
      requestBody = await context.req.json();
    } catch {
      return context.body(null, 400);
    }
    const parsedRequest = editMessageRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) {
      return context.body(null, 400);
    }

    const { privateMessaging, botMessageViews } = context.get('emulationSession');
    const result = privateMessaging.editAccountMessage({
      fromAccountId: accountId.data,
      chat: { type: 'private', botId: botId.data },
      botMessageId: messageId.data,
      edit: readAccountMessageEdit(parsedRequest.data),
    });
    if (!result.edited) {
      const isNotFound = result.reason === 'account_not_found' ||
        result.reason === 'bot_not_found' || result.reason === 'message_not_found';
      return context.body(null, isNotFound ? 404 : 400);
    }
    return context.json({ message: botMessageViews.viewPrivateMessageForBot(result.message) });
  });

  accountRoutes.put(BLOCKED_BOT_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').botBlocking.blockBot({
      accountId: accountId.data,
      botId: botId.data,
    });
    return context.body(null, result.applied ? 204 : 404);
  });

  accountRoutes.delete(BLOCKED_BOT_PATH, (context) => {
    const accountId = telegramUserIdPathParameterSchema.safeParse(
      context.req.param(ACCOUNT_ID_PARAMETER),
    );
    const botId = telegramUserIdPathParameterSchema.safeParse(context.req.param(BOT_ID_PARAMETER));
    if (!accountId.success || !botId.success) {
      return context.body(null, 400);
    }

    const result = context.get('emulationSession').botBlocking.unblockBot({
      accountId: accountId.data,
      botId: botId.data,
    });
    return context.body(null, result.applied ? 204 : 404);
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
        botMessageViews.viewPrivateMessageForBot(shownReplyInterface.message).message_id,
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
      return context.body(null, accountMessageFailureStatus(result.reason));
    }
    return context.json(
      { message: botMessageViews.viewPrivateMessageForBot(result.message) },
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
      messageId: parsedRequest.data.message_id,
      callbackData: parsedRequest.data.callback_data,
      expired: parsedRequest.data.expired,
    });
    if (!result.pressed) {
      switch (result.reason) {
        case 'callback_button_not_found':
          return context.body(null, 400);
        case 'not_a_member':
          return context.body(null, 403);
        default:
          return context.body(null, 404);
      }
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

type AccountMessageContent = Parameters<
  EmulationSession['privateMessaging']['sendAccountMessage']
>[0]['content'];

/**
 * Reads the content of an account's message, checking an uploaded photo as Telegram does; returns
 * `undefined` for a file Telegram would not send.
 */
function readAccountMessageContent(
  request: z.infer<typeof sendMessageRequestSchema>,
  mediaFiles: EmulationSession['mediaFiles'],
): AccountMessageContent | undefined {
  if ('text' in request) {
    return { kind: 'text', text: request.text };
  }
  const preparation = 'photo' in request
    ? mediaFiles.preparePhotoUpload(request.photo.content_base64)
    : mediaFiles.prepareDocumentUpload(
      request.document.content_base64,
      request.document.file_name,
    );
  return preparation.prepared
    ? { kind: 'media', upload: preparation.upload, caption: request.caption }
    : undefined;
}

type AccountMessageEdit = Parameters<
  EmulationSession['privateMessaging']['editAccountMessage']
>[0]['edit'];

function readAccountMessageEdit(
  request: z.infer<typeof editMessageRequestSchema>,
): AccountMessageEdit {
  return 'text' in request
    ? { kind: 'text', text: request.text }
    : { kind: 'caption', caption: request.caption };
}

/** Why an account's message, sent directly or by pressing a reply keyboard button, failed. */
type AccountMessageFailureReason = Extract<
  ReturnType<EmulationSession['privateMessaging']['pressReplyKeyboardButton']>,
  { readonly sent: false }
>['reason'];

/** A missing participant is not found, and a block conflicts with writing to the bot. */
function accountMessageFailureStatus(reason: AccountMessageFailureReason): 400 | 404 | 409 {
  switch (reason) {
    case 'account_not_found':
    case 'bot_not_found':
      return 404;
    case 'bot_blocked':
      return 409;
    default:
      return 400;
  }
}

type SupergroupMessaging = EmulationSession['supergroupMessaging'];

/** Why an account's message, edit, or history request in a supergroup failed. */
type SupergroupAccountFailureReason =
  | Extract<ReturnType<SupergroupMessaging['sendAccountMessage']>, { sent: false }>['reason']
  | Extract<ReturnType<SupergroupMessaging['editAccountMessage']>, { edited: false }>['reason']
  | Extract<ReturnType<SupergroupMessaging['getMessageHistory']>, { found: false }>['reason'];

/**
 * A missing account, supergroup, or message is not found, and an account that is not a member of
 * the supergroup is forbidden from it; other failures reject the request.
 */
function supergroupMemberFailureStatus(reason: SupergroupAccountFailureReason): 400 | 403 | 404 {
  switch (reason) {
    case 'account_not_found':
    case 'chat_not_found':
    case 'message_not_found':
      return 404;
    case 'not_a_member':
      return 403;
    default:
      return 400;
  }
}

/** Shows a supergroup as the Bot API shows a chat, with its description when it has one. */
function presentSupergroup({ id, title, description }: Supergroup) {
  return {
    id,
    type: 'supergroup' as const,
    title,
    ...(description === undefined ? {} : { description }),
  };
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
