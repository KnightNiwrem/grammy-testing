import type {
  BotApiBotUser,
  BotApiCallbackQuery,
  BotApiInlineKeyboardButton,
  BotApiInlineKeyboardMarkup,
  BotApiMessageEntity,
  BotApiPrivateTextMessage,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { InlineKeyboard, InlineKeyboardButton } from '../types/inline_keyboard.ts';
import type { VirtualAccountProfile } from '../types/virtual_account.ts';
import type { VirtualBotProfile } from '../types/virtual_bot.ts';
import type { PrivateTextMessage, TextEntity } from '../types/virtual_message.ts';

export interface PrivateTextMessageForBotProjectionInput {
  readonly message: PrivateTextMessage;
  /** The conversation's account, which is the observing bot's private-chat peer. */
  readonly account: VirtualAccountProfile;
  /** The conversation's bot, which observes the message. */
  readonly bot: VirtualBotProfile;
  /** The message's ID in the observing bot's message box. */
  readonly observerMessageId: number;
  /** Every user the message's text mentions, by ID. */
  readonly mentionedUsers: ReadonlyMap<number, BotApiUser>;
}

/**
 * Projects a canonical private text message as seen by the bot of its conversation.
 *
 * The chat is always the account, whoever wrote the message; the sender follows the author.
 */
export function projectPrivateTextMessageForBot(
  { message, account, bot, observerMessageId, mentionedUsers }:
    PrivateTextMessageForBotProjectionInput,
): BotApiPrivateTextMessage {
  const { id, first_name, last_name, username } = account;
  return {
    message_id: observerMessageId,
    from: message.authorRole === 'account' ? account : projectBotAsUser(bot),
    chat: {
      id,
      type: 'private',
      first_name,
      ...(last_name === undefined ? {} : { last_name }),
      ...(username === undefined ? {} : { username }),
    },
    date: message.sentAtUnixSeconds,
    ...(message.textEditedAtUnixSeconds === undefined
      ? {}
      : { edit_date: message.textEditedAtUnixSeconds }),
    text: message.text,
    ...(message.entities.length === 0 ? {} : {
      entities: message.entities.map((entity) => projectTextEntity(entity, mentionedUsers)),
    }),
    ...(message.inlineKeyboard === undefined
      ? {}
      : { reply_markup: projectInlineKeyboardMarkup(message.inlineKeyboard) }),
  };
}

export interface CallbackQueryForBotProjectionInput {
  readonly callbackQuery: CallbackQuery;
  /** The account that pressed the button. */
  readonly account: VirtualAccountProfile;
  /** The message carrying the pressed button, as the observing bot currently sees it. */
  readonly message: BotApiPrivateTextMessage;
}

/** Projects a callback query as the bot that owns the pressed button receives it. */
export function projectCallbackQueryForBot(
  { callbackQuery, account, message }: CallbackQueryForBotProjectionInput,
): BotApiCallbackQuery {
  return {
    id: callbackQuery.id,
    from: account,
    message,
    chat_instance: callbackQuery.chatInstance,
    data: callbackQuery.callbackData,
  };
}

/** Shows a bot as messages show users, without the capabilities that only `getMe` reports. */
export function projectBotAsUser(bot: VirtualBotProfile): BotApiBotUser {
  const { id, first_name, last_name, username } = bot;
  return {
    id,
    is_bot: true,
    first_name,
    ...(last_name === undefined ? {} : { last_name }),
    username,
  };
}

function projectTextEntity(
  entity: TextEntity,
  mentionedUsers: ReadonlyMap<number, BotApiUser>,
): BotApiMessageEntity {
  const { offset, length } = entity;
  switch (entity.type) {
    case 'pre':
      return entity.language === undefined
        ? { type: 'pre', offset, length }
        : { type: 'pre', offset, length, language: entity.language };
    case 'text_link':
      return { type: 'text_link', offset, length, url: entity.url };
    case 'text_mention': {
      const user = mentionedUsers.get(entity.userId);
      if (user === undefined) {
        throw new Error(`Mentioned user ${entity.userId} was not provided`);
      }
      return { type: 'text_mention', offset, length, user };
    }
    case 'custom_emoji':
      return { type: 'custom_emoji', offset, length, custom_emoji_id: entity.customEmojiId };
    default:
      return { type: entity.type, offset, length };
  }
}

function projectInlineKeyboardMarkup(inlineKeyboard: InlineKeyboard): BotApiInlineKeyboardMarkup {
  return { inline_keyboard: inlineKeyboard.map((row) => row.map(projectInlineKeyboardButton)) };
}

function projectInlineKeyboardButton(button: InlineKeyboardButton): BotApiInlineKeyboardButton {
  switch (button.kind) {
    case 'callback':
      return { text: button.text, callback_data: button.callbackData };
    case 'url':
      return { text: button.text, url: button.url };
    default: {
      const unhandledButton: never = button;
      throw new Error(`Unhandled inline keyboard button: ${JSON.stringify(unhandledButton)}`);
    }
  }
}
