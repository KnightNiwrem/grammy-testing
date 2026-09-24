import { isParseMode, parseMarkup } from '../text_entities/parse_mode.ts';
import type { BotApiBotCommand, BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { BotCommand, BotCommandLanguageCode, BotCommandScope } from '../types/bot_command.ts';
import type { CallbackQueryId } from '../types/callback_query.ts';
import type { InlineKeyboard } from '../types/inline_keyboard.ts';
import type { VirtualBot, VirtualBotProfile } from '../types/virtual_bot.ts';
import type { ChatAction } from '../types/virtual_chat.ts';
import type { PrivateTextMessage, TextEntity } from '../types/virtual_message.ts';
import type { GetUpdatesRequest, GetUpdatesResult } from './bot_update_polling.ts';

export interface DeleteWebhookRequest {
  readonly dropPendingUpdates: boolean;
}

/** The most UTF-8 bytes of text the Bot API reads before applying its formatting. */
const MAX_FORMATTED_TEXT_BYTES = 1 << 15;

/** A parse mode that leaves text as it is, as omitting it does. */
const NO_PARSE_MODE = 'none';

/** Formatted text as a bot specified it: entities from `entities` or from parsed markup. */
export interface SpecifiedFormattedText {
  readonly text: string;
  /**
   * Validated and normalized as Telegram does before the message is stored; omitted for plain
   * text.
   */
  readonly entities?: readonly TextEntity[];
}

export interface ReadFormattedTextRequest {
  /** Nonempty message text, which may be written in markup. */
  readonly text: string;
  /** The `parse_mode` parameter, matched case-insensitively. */
  readonly parseMode?: string;
  /** The `entities` parameter, which a parse mode overrides. */
  readonly entities: readonly TextEntity[];
}

export type ReadFormattedTextFailureReason =
  | 'text_too_long'
  | 'parse_mode_unsupported'
  | 'text_encoding_invalid'
  | 'date_time_unsupported';

export type ReadFormattedTextResult =
  | { readonly read: true; readonly formattedText: SpecifiedFormattedText }
  | { readonly read: false; readonly reason: ReadFormattedTextFailureReason }
  | {
    readonly read: false;
    readonly reason: 'markup_invalid';
    /** TDLib's description of the markup error. */
    readonly markupError: string;
  };

/** Telegram rejected the text or its entities; `textError` is TDLib's own description. */
interface TextInvalidFailure {
  readonly reason: 'text_invalid';
  readonly textError: string;
}

export interface SendMessageRequest extends SpecifiedFormattedText {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  readonly inlineKeyboard?: InlineKeyboard;
}

export type SendMessageFailureReason =
  | 'message_text_empty'
  | 'chat_not_found'
  | 'message_text_too_long'
  | 'callback_data_invalid';

export type SendMessageResult =
  | { readonly sent: true; readonly message: BotApiPrivateTextMessage }
  | (
    & { readonly sent: false }
    & (
      | { readonly reason: SendMessageFailureReason }
      | TextInvalidFailure
    )
  );

/** A message of one of the bot's chats, as Bot API methods address it. */
interface MessageTarget {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  /** The message's ID in the bot's chat. */
  readonly messageId: number;
}

export interface EditMessageTextRequest extends MessageTarget, SpecifiedFormattedText {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export interface EditMessageReplyMarkupRequest extends MessageTarget {
  /** Omitting the keyboard removes the message's keyboard, as on Telegram. */
  readonly inlineKeyboard?: InlineKeyboard;
}

export type EditMessageReplyMarkupFailureReason =
  | 'chat_not_found'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

export type EditMessageTextFailureReason =
  | EditMessageReplyMarkupFailureReason
  | 'message_text_empty'
  | 'message_text_too_long';

export type EditMessageResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: BotApiPrivateTextMessage }
  | { readonly edited: false; readonly reason: FailureReason };

export type EditMessageTextResult =
  | EditMessageResult<EditMessageTextFailureReason>
  | ({ readonly edited: false } & TextInvalidFailure);

export interface SendChatActionRequest {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  readonly action: ChatAction;
}

export type SendChatActionResult =
  | { readonly sent: true }
  | { readonly sent: false; readonly reason: 'chat_not_found' };

export type DeleteMessageRequest = MessageTarget;

export type DeleteMessageResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly reason: 'chat_not_found' | 'message_not_found' };

export interface DeleteMessagesRequest {
  /** The Bot API `chat_id`, which for a private chat is the other user's ID. */
  readonly chatId: number;
  /** The messages' IDs in the bot's chat. */
  readonly messageIds: readonly number[];
}

export type DeleteMessagesResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly reason: 'chat_not_found' };

export interface AnswerCallbackQueryRequest {
  readonly callbackQueryId: CallbackQueryId;
  readonly text?: string;
  readonly showAlert: boolean;
  readonly cacheTimeSeconds: number;
}

export type AnswerCallbackQueryResult =
  | { readonly answered: true }
  | { readonly answered: false; readonly reason: 'query_id_invalid' };

interface BotCredentialLookup {
  getByToken(token: string): VirtualBot | undefined;
}

interface BotUpdatePolling {
  getUpdates(botId: number, request: GetUpdatesRequest): Promise<GetUpdatesResult>;
}

interface PendingBotUpdates {
  discardPendingUpdates(botId: number): void;
}

interface BotPrivateChat {
  readonly type: 'private';
  readonly accountId: number;
}

type BotMessageSendingResult =
  | { readonly sent: true; readonly message: PrivateTextMessage }
  | {
    readonly sent: false;
    readonly reason:
      | 'bot_not_found'
      | 'message_text_empty'
      | 'account_not_found'
      | 'conversation_not_started'
      | 'message_text_too_long'
      | 'callback_data_invalid';
  }
  | ({ readonly sent: false } & TextInvalidFailure);

/** Why an edit of either kind can fail, apart from failures about the text. */
type BotMessageEditFailureReason =
  | 'bot_not_found'
  | 'account_not_found'
  | 'conversation_not_started'
  | 'message_not_found'
  | 'message_not_editable'
  | 'callback_data_invalid'
  | 'message_not_modified';

type BotMessageEditingResult<FailureReason extends string> =
  | { readonly edited: true; readonly message: PrivateTextMessage }
  | { readonly edited: false; readonly reason: FailureReason };

interface BotMessaging {
  sendBotMessage(input: {
    readonly fromBotId: number;
    readonly to: BotPrivateChat;
    readonly text: string;
    readonly entities?: readonly TextEntity[];
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageSendingResult;
  editBotMessageText(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly text: string;
    readonly entities?: readonly TextEntity[];
    readonly inlineKeyboard?: InlineKeyboard;
  }):
    | BotMessageEditingResult<
      BotMessageEditFailureReason | 'message_text_empty' | 'message_text_too_long'
    >
    | ({ readonly edited: false } & TextInvalidFailure);
  editBotMessageInlineKeyboard(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageId: number;
    readonly inlineKeyboard?: InlineKeyboard;
  }): BotMessageEditingResult<BotMessageEditFailureReason>;
  sendBotChatAction(input: {
    readonly fromBotId: number;
    readonly to: BotPrivateChat;
    readonly action: ChatAction;
  }):
    | { readonly sent: true }
    | {
      readonly sent: false;
      readonly reason: 'bot_not_found' | 'account_not_found' | 'conversation_not_started';
    };
  deleteMessagesByBot(input: {
    readonly fromBotId: number;
    readonly chat: BotPrivateChat;
    readonly botMessageIds: readonly number[];
  }):
    | { readonly deleted: true; readonly deletedMessageCount: number }
    | {
      readonly deleted: false;
      readonly reason: 'bot_not_found' | 'account_not_found' | 'conversation_not_started';
    };
}

/** A command list of the bot, addressed as the command methods address it. */
export interface MyCommandsTarget {
  readonly scope: BotCommandScope;
  readonly languageCode: BotCommandLanguageCode;
}

export interface SetMyCommandsRequest extends MyCommandsTarget {
  readonly commands: readonly {
    readonly command: string;
    readonly description: string;
    readonly isEphemeral: boolean;
  }[];
}

/** Why a scope or language cannot address one of the bot's command lists. */
export type MyCommandsTargetFailureReason =
  | 'chat_not_found'
  | 'scope_not_allowed_in_private_chats'
  | 'language_code_invalid';

export type SetMyCommandsFailureReason =
  | MyCommandsTargetFailureReason
  | 'command_not_utf8'
  | 'command_description_not_utf8'
  | 'command_empty'
  | 'command_too_long'
  | 'command_description_empty'
  | 'command_description_too_long'
  | 'too_many_commands'
  | 'command_invalid';

export type SetMyCommandsResult =
  | { readonly set: true }
  | { readonly set: false; readonly reason: SetMyCommandsFailureReason };

export type GetMyCommandsResult =
  | { readonly found: true; readonly commands: readonly BotApiBotCommand[] }
  | { readonly found: false; readonly reason: MyCommandsTargetFailureReason };

export type DeleteMyCommandsResult =
  | { readonly deleted: true }
  | { readonly deleted: false; readonly reason: MyCommandsTargetFailureReason };

interface BotCommandListAddress extends MyCommandsTarget {
  readonly botId: number;
}

type BotCommandListTargetFailure = MyCommandsTargetFailureReason | 'bot_not_found';

interface BotCommandLists {
  setBotCommands(input: BotCommandListAddress & Pick<SetMyCommandsRequest, 'commands'>):
    | { readonly set: true }
    | {
      readonly set: false;
      readonly reason:
        | BotCommandListTargetFailure
        | Exclude<
          SetMyCommandsFailureReason,
          MyCommandsTargetFailureReason
        >;
    };
  getBotCommands(target: BotCommandListAddress):
    | { readonly found: true; readonly commands: readonly BotCommand[] }
    | { readonly found: false; readonly reason: BotCommandListTargetFailure };
  deleteBotCommands(target: BotCommandListAddress):
    | { readonly deleted: true }
    | { readonly deleted: false; readonly reason: BotCommandListTargetFailure };
}

interface CallbackQueryAnswering {
  answerCallbackQuery(input: {
    readonly fromBotId: number;
    readonly callbackQueryId: CallbackQueryId;
    readonly text?: string;
    readonly showAlert: boolean;
    readonly cacheTimeSeconds: number;
  }): { readonly answered: boolean };
}

interface BotMessageViews {
  viewPrivateTextMessageForBot(message: PrivateTextMessage): BotApiPrivateTextMessage;
}

interface BotApiServiceDependencies {
  readonly bots: BotCredentialLookup;
  readonly updatePolling: BotUpdatePolling;
  readonly pendingUpdates: PendingBotUpdates;
  readonly botMessages: BotMessaging;
  readonly botMessageViews: BotMessageViews;
  readonly callbackQueries: CallbackQueryAnswering;
  readonly botCommands: BotCommandLists;
}

/**
 * The application boundary for Bot API methods.
 *
 * Transport authenticates each call with `authenticate` before invoking a method, so that an
 * invalid token is rejected before request parameters are validated, as Telegram does. Invariants
 * that span a bot's configuration and update delivery, such as polling and webhook delivery being
 * mutually exclusive, belong here rather than in route handlers.
 */
export class BotApiService {
  readonly #bots: BotCredentialLookup;
  readonly #updatePolling: BotUpdatePolling;
  readonly #pendingUpdates: PendingBotUpdates;
  readonly #botMessages: BotMessaging;
  readonly #botMessageViews: BotMessageViews;
  readonly #callbackQueries: CallbackQueryAnswering;
  readonly #botCommands: BotCommandLists;

  constructor(
    {
      bots,
      updatePolling,
      pendingUpdates,
      botMessages,
      botMessageViews,
      callbackQueries,
      botCommands,
    }: BotApiServiceDependencies,
  ) {
    this.#bots = bots;
    this.#updatePolling = updatePolling;
    this.#pendingUpdates = pendingUpdates;
    this.#botMessages = botMessages;
    this.#botMessageViews = botMessageViews;
    this.#callbackQueries = callbackQueries;
    this.#botCommands = botCommands;
  }

  /** Returns the profile of the bot that owns `token`, or `undefined` if no bot does. */
  authenticate(token: string): VirtualBotProfile | undefined {
    return this.#bots.getByToken(token)?.profile;
  }

  /** Polls the authenticated bot's pending updates. */
  getUpdates(
    authenticatedBot: VirtualBotProfile,
    request: GetUpdatesRequest,
  ): Promise<GetUpdatesResult> {
    return this.#updatePolling.getUpdates(authenticatedBot.id, request);
  }

  /**
   * Bots here never have a webhook, so, as on Telegram when none is set, this only discards
   * pending updates when asked to. A held long poll is left running, as Telegram does.
   */
  deleteWebhook(
    authenticatedBot: VirtualBotProfile,
    { dropPendingUpdates }: DeleteWebhookRequest,
  ): void {
    if (dropPendingUpdates) {
      this.#pendingUpdates.discardPendingUpdates(authenticatedBot.id);
    }
  }

  /**
   * Reads message text with its `parse_mode` or `entities`, as the official Bot API server's
   * `Client::get_formatted_text` does before it looks at the chat: a parse mode other than `none`
   * turns markup into entities and overrides `entities`. The result still has to pass the checks
   * that sending or editing applies.
   *
   * Date and time entities, which Telegram's markup can produce, are not supported.
   */
  readFormattedText(
    { text, parseMode, entities }: ReadFormattedTextRequest,
  ): ReadFormattedTextResult {
    if (new TextEncoder().encode(text).length > MAX_FORMATTED_TEXT_BYTES) {
      return { read: false, reason: 'text_too_long' };
    }
    const parseModeName = parseMode?.toLowerCase() ?? '';
    if (parseModeName.length === 0 || parseModeName === NO_PARSE_MODE) {
      return { read: true, formattedText: { text, entities } };
    }
    if (!isParseMode(parseModeName)) {
      return { read: false, reason: 'parse_mode_unsupported' };
    }
    if (!text.isWellFormed()) {
      return { read: false, reason: 'text_encoding_invalid' };
    }

    const parsing = parseMarkup(text, parseModeName);
    if (parsing.parsed) {
      return { read: true, formattedText: { text: parsing.text, entities: parsing.entities } };
    }
    return parsing.reason === 'markup_invalid'
      ? { read: false, reason: 'markup_invalid', markupError: parsing.error }
      : { read: false, reason: parsing.reason };
  }

  /** Sends text to a private chat; other chat types are not supported yet. */
  sendMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, text, entities, inlineKeyboard }: SendMessageRequest,
  ): SendMessageResult {
    const result = this.#botMessages.sendBotMessage({
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      text,
      entities,
      inlineKeyboard,
    });
    if (result.sent) {
      return {
        sent: true,
        message: this.#botMessageViews.viewPrivateTextMessageForBot(result.message),
      };
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_text_empty':
      case 'message_text_too_long':
      case 'callback_data_invalid':
        return { sent: false, reason: result.reason };
      // A bot can address a user only after the user has written to it. Telegram reports any
      // other user, like an unknown chat, as not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { sent: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledFailure: never = result;
        throw new Error(`Unhandled bot message failure: ${JSON.stringify(unhandledFailure)}`);
      }
    }
  }

  /** Shows a chat action, such as typing, in a private chat; other chat types are not supported. */
  sendChatAction(
    authenticatedBot: VirtualBotProfile,
    { chatId, action }: SendChatActionRequest,
  ): SendChatActionResult {
    const result = this.#botMessages.sendBotChatAction({
      fromBotId: authenticatedBot.id,
      to: { type: 'private', accountId: chatId },
      action,
    });
    if (result.sent) {
      return result;
    }
    switch (result.reason) {
      // As for sending, a chat the bot cannot address is not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { sent: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled chat action failure: ${unhandledReason}`);
      }
    }
  }

  /**
   * Replaces the text, entities, and inline keyboard of a message the bot sent to a private chat.
   */
  editMessageText(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, text, entities, inlineKeyboard }: EditMessageTextRequest,
  ): EditMessageTextResult {
    const result = this.#botMessages.editBotMessageText({
      fromBotId: authenticatedBot.id,
      chat: { type: 'private', accountId: chatId },
      botMessageId: messageId,
      text,
      entities,
      inlineKeyboard,
    });
    if (result.edited) {
      return this.#presentEditedMessage(result.message);
    }

    switch (result.reason) {
      case 'text_invalid':
        return result;
      case 'message_text_empty':
      case 'message_text_too_long':
        return { edited: false, reason: result.reason };
      default:
        return {
          edited: false,
          reason: toEditMessageFailureReason(authenticatedBot, result.reason),
        };
    }
  }

  /** Replaces the inline keyboard of a message the bot sent to a private chat. */
  editMessageReplyMarkup(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId, inlineKeyboard }: EditMessageReplyMarkupRequest,
  ): EditMessageResult<EditMessageReplyMarkupFailureReason> {
    const result = this.#botMessages.editBotMessageInlineKeyboard({
      fromBotId: authenticatedBot.id,
      chat: { type: 'private', accountId: chatId },
      botMessageId: messageId,
      inlineKeyboard,
    });
    if (result.edited) {
      return this.#presentEditedMessage(result.message);
    }
    return { edited: false, reason: toEditMessageFailureReason(authenticatedBot, result.reason) };
  }

  /**
   * Deletes a message of a private chat, which either participant may have written. Unlike
   * `deleteMessages`, it fails when the ID identifies no message of the chat, as on Telegram.
   */
  deleteMessage(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageId }: DeleteMessageRequest,
  ): DeleteMessageResult {
    const result = this.#deleteChatMessages(authenticatedBot, chatId, [messageId]);
    if (!result.deleted) {
      return result;
    }
    return result.deletedMessageCount === 0
      ? { deleted: false, reason: 'message_not_found' }
      : { deleted: true };
  }

  /**
   * Deletes messages of a private chat. As on Telegram, IDs that identify no message of the chat
   * are skipped.
   */
  deleteMessages(
    authenticatedBot: VirtualBotProfile,
    { chatId, messageIds }: DeleteMessagesRequest,
  ): DeleteMessagesResult {
    const result = this.#deleteChatMessages(authenticatedBot, chatId, messageIds);
    return result.deleted ? { deleted: true } : result;
  }

  /** Answers a callback query that an account created by pressing one of the bot's buttons. */
  answerCallbackQuery(
    authenticatedBot: VirtualBotProfile,
    { callbackQueryId, text, showAlert, cacheTimeSeconds }: AnswerCallbackQueryRequest,
  ): AnswerCallbackQueryResult {
    const result = this.#callbackQueries.answerCallbackQuery({
      fromBotId: authenticatedBot.id,
      callbackQueryId,
      text,
      showAlert,
      cacheTimeSeconds,
    });
    return result.answered ? { answered: true } : { answered: false, reason: 'query_id_invalid' };
  }

  /** Replaces the bot's command list for a scope and language; an empty list deletes it. */
  setMyCommands(
    authenticatedBot: VirtualBotProfile,
    { commands, scope, languageCode }: SetMyCommandsRequest,
  ): SetMyCommandsResult {
    const result = this.#botCommands.setBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
      commands,
    });
    if (result.set) {
      return result;
    }
    if (result.reason === 'bot_not_found') {
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    }
    return { set: false, reason: result.reason };
  }

  /** Returns the bot's command list for exactly this scope and language. */
  getMyCommands(
    authenticatedBot: VirtualBotProfile,
    { scope, languageCode }: MyCommandsTarget,
  ): GetMyCommandsResult {
    const result = this.#botCommands.getBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
    });
    if (!result.found) {
      if (result.reason === 'bot_not_found') {
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      }
      return { found: false, reason: result.reason };
    }
    return { found: true, commands: result.commands.map(projectBotCommand) };
  }

  /** Deletes the bot's command list for a scope and language. */
  deleteMyCommands(
    authenticatedBot: VirtualBotProfile,
    { scope, languageCode }: MyCommandsTarget,
  ): DeleteMyCommandsResult {
    const result = this.#botCommands.deleteBotCommands({
      botId: authenticatedBot.id,
      scope,
      languageCode,
    });
    if (result.deleted) {
      return result;
    }
    if (result.reason === 'bot_not_found') {
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    }
    return { deleted: false, reason: result.reason };
  }

  #deleteChatMessages(
    authenticatedBot: VirtualBotProfile,
    chatId: number,
    messageIds: readonly number[],
  ):
    | { readonly deleted: true; readonly deletedMessageCount: number }
    | { readonly deleted: false; readonly reason: 'chat_not_found' } {
    const result = this.#botMessages.deleteMessagesByBot({
      fromBotId: authenticatedBot.id,
      chat: { type: 'private', accountId: chatId },
      botMessageIds: messageIds,
    });
    if (result.deleted) {
      return result;
    }

    switch (result.reason) {
      // As for sending, a chat the bot cannot address is not found.
      case 'account_not_found':
      case 'conversation_not_started':
        return { deleted: false, reason: 'chat_not_found' };
      case 'bot_not_found':
        throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
      default: {
        const unhandledReason: never = result.reason;
        throw new Error(`Unhandled bot message deletion failure: ${unhandledReason}`);
      }
    }
  }

  #presentEditedMessage(
    message: PrivateTextMessage,
  ): { readonly edited: true; readonly message: BotApiPrivateTextMessage } {
    return { edited: true, message: this.#botMessageViews.viewPrivateTextMessageForBot(message) };
  }
}

/** Shows a command as the Bot API does, with `is_ephemeral` only when set. */
function projectBotCommand({ command, description, isEphemeral }: BotCommand): BotApiBotCommand {
  return { command, description, ...(isEphemeral ? { is_ephemeral: true as const } : {}) };
}

/** Translates the edit failures shared by both edit methods into Bot API failures. */
function toEditMessageFailureReason(
  authenticatedBot: VirtualBotProfile,
  reason: BotMessageEditFailureReason,
): EditMessageReplyMarkupFailureReason {
  switch (reason) {
    case 'message_not_found':
    case 'message_not_editable':
    case 'callback_data_invalid':
    case 'message_not_modified':
      return reason;
    // As for sending, a chat the bot cannot address is not found.
    case 'account_not_found':
    case 'conversation_not_started':
      return 'chat_not_found';
    case 'bot_not_found':
      throw new Error(`Authenticated bot ${authenticatedBot.id} does not exist`);
    default: {
      const unhandledReason: never = reason;
      throw new Error(`Unhandled bot message edit failure: ${unhandledReason}`);
    }
  }
}
