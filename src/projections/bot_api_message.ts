import type {
  BotApiBotUser,
  BotApiCallbackQuery,
  BotApiGroupChat,
  BotApiGroupChatBotMember,
  BotApiInlineKeyboardButton,
  BotApiInlineKeyboardMarkup,
  BotApiMessageEntity,
  BotApiMyChatMemberUpdated,
  BotApiPrivateChat,
  BotApiPrivateChatBotMember,
  BotApiPrivateTextMessage,
  BotApiRepliedPrivateTextMessage,
  BotApiRepliedSupergroupTextMessage,
  BotApiSupergroupChat,
  BotApiSupergroupTextMessage,
  BotApiTextMessage,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type { BotBlockChangedEvent, ChatMemberAddedEvent } from '../types/chat_domain_event.ts';
import type { InlineKeyboard, InlineKeyboardButton } from '../types/inline_keyboard.ts';
import type { VirtualAccountProfile } from '../types/virtual_account.ts';
import type { VirtualBotProfile } from '../types/virtual_bot.ts';
import type { BasicGroup, Supergroup } from '../types/virtual_chat.ts';
import type {
  PrivateTextMessage,
  SupergroupTextMessage,
  TextEntity,
  TextMessage,
} from '../types/virtual_message.ts';

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
  /** The replied message as the observing bot sees it; omitted when there is none to show. */
  readonly repliedMessage?: BotApiRepliedPrivateTextMessage;
}

/**
 * Projects a canonical private text message as seen by the bot of its conversation, in the field
 * order Telegram uses.
 *
 * The chat is always the account, whoever wrote the message; the sender follows the author.
 */
export function projectPrivateTextMessageForBot(
  { message, account, bot, observerMessageId, mentionedUsers, repliedMessage }:
    PrivateTextMessageForBotProjectionInput,
): BotApiPrivateTextMessage {
  return {
    message_id: observerMessageId,
    from: message.authorRole === 'account' ? account : projectBotAsUser(bot),
    chat: projectPrivateChat(account),
    date: message.sentAtUnixSeconds,
    ...projectTextMessageContent(message, mentionedUsers, repliedMessage),
  };
}

export interface SupergroupTextMessageProjectionInput {
  readonly message: SupergroupTextMessage;
  readonly supergroup: Supergroup;
  /** The member who wrote the message. */
  readonly author: BotApiUser;
  /** The message's ID in the supergroup's message box, which every member sees. */
  readonly messageId: number;
  /** Every user the message's text mentions, by ID. */
  readonly mentionedUsers: ReadonlyMap<number, BotApiUser>;
  /** The replied message; omitted when there is none to show. */
  readonly repliedMessage?: BotApiRepliedSupergroupTextMessage;
}

/**
 * Projects a canonical supergroup text message, in the field order Telegram uses. A supergroup
 * numbers its messages once, so every member sees the same projection.
 */
export function projectSupergroupTextMessage(
  { message, supergroup, author, messageId, mentionedUsers, repliedMessage }:
    SupergroupTextMessageProjectionInput,
): BotApiSupergroupTextMessage {
  return {
    message_id: messageId,
    from: author,
    chat: projectSupergroupChat(supergroup),
    date: message.sentAtUnixSeconds,
    ...projectTextMessageContent(message, mentionedUsers, repliedMessage),
  };
}

/** Projects the fields that follow a message's date, which every chat type shows alike. */
function projectTextMessageContent<RepliedMessage>(
  message: TextMessage,
  mentionedUsers: ReadonlyMap<number, BotApiUser>,
  repliedMessage: RepliedMessage | undefined,
) {
  return {
    ...(message.textEditedAtUnixSeconds === undefined
      ? {}
      : { edit_date: message.textEditedAtUnixSeconds }),
    ...(repliedMessage === undefined ? {} : { reply_to_message: repliedMessage }),
    text: message.text,
    ...(message.entities.length === 0 ? {} : {
      entities: message.entities.map((entity) => projectTextEntity(entity, mentionedUsers)),
    }),
    ...(message.inlineKeyboard === undefined
      ? {}
      : { reply_markup: projectInlineKeyboardMarkup(message.inlineKeyboard) }),
    ...(message.isContentProtected ? { has_protected_content: true as const } : {}),
  };
}

export interface CallbackQueryForBotProjectionInput {
  readonly callbackQuery: CallbackQuery;
  /** The account that pressed the button. */
  readonly account: VirtualAccountProfile;
  /** The message carrying the pressed button, as the observing bot currently sees it. */
  readonly message: BotApiTextMessage;
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

export interface BotBlockChangeForBotProjectionInput {
  readonly event: BotBlockChangedEvent;
  /** The account that blocked or unblocked the bot. */
  readonly account: VirtualAccountProfile;
  /** The bot whose membership in the private chat changed, which observes the change. */
  readonly bot: VirtualBotProfile;
}

/**
 * Projects a block or unblock as the blocked bot receives it: as TDLib reports Telegram's
 * `updateBotStopped`, the bot's membership in the account's private chat changes between
 * `member` and `kicked` forever, and the account made the change.
 */
export function projectBotBlockChangeForBot(
  { event, account, bot }: BotBlockChangeForBotProjectionInput,
): BotApiMyChatMemberUpdated {
  const user = projectBotAsUser(bot);
  const member: BotApiPrivateChatBotMember = { user, status: 'member' };
  const kicked: BotApiPrivateChatBotMember = { user, status: 'kicked', until_date: 0 };
  return {
    chat: projectPrivateChat(account),
    from: account,
    date: event.changedAtUnixSeconds,
    old_chat_member: event.isBlocked ? member : kicked,
    new_chat_member: event.isBlocked ? kicked : member,
  };
}

export interface BotJoinedGroupProjectionInput {
  readonly event: ChatMemberAddedEvent;
  readonly chat: BasicGroup | Supergroup;
  /** The account that added the bot. */
  readonly account: VirtualAccountProfile;
  /** The bot that joined the group, which observes the change. */
  readonly bot: VirtualBotProfile;
}

/**
 * Projects an account's addition of a bot to a group as the added bot receives it: the bot's
 * membership changes from `left` to `member`, and the account made the change.
 */
export function projectBotJoinedGroupForBot(
  { event, chat, account, bot }: BotJoinedGroupProjectionInput,
): BotApiMyChatMemberUpdated {
  const user = projectBotAsUser(bot);
  const left: BotApiGroupChatBotMember = { user, status: 'left' };
  const member: BotApiGroupChatBotMember = { user, status: 'member' };
  return {
    chat: projectGroupChat(chat),
    from: account,
    date: event.addedAtUnixSeconds,
    old_chat_member: left,
    new_chat_member: member,
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

/** Shows the private chat with an account, as the bot at its other end sees it. */
function projectPrivateChat(
  { id, first_name, last_name, username }: VirtualAccountProfile,
): BotApiPrivateChat {
  return {
    id,
    type: 'private',
    first_name,
    ...(last_name === undefined ? {} : { last_name }),
    ...(username === undefined ? {} : { username }),
  };
}

/** Shows a group chat as its members see it. */
function projectGroupChat(chat: BasicGroup | Supergroup): BotApiGroupChat {
  return chat.kind === 'supergroup'
    ? projectSupergroupChat(chat)
    : { id: chat.id, title: chat.title, type: 'group' };
}

function projectSupergroupChat({ id, title }: Supergroup): BotApiSupergroupChat {
  return { id, title, type: 'supergroup' };
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
