import type {
  BotApiBotUser,
  BotApiCallbackQuery,
  BotApiChatMember,
  BotApiDocument,
  BotApiGroupChat,
  BotApiGroupChatBotMember,
  BotApiInlineKeyboardButton,
  BotApiInlineKeyboardMarkup,
  BotApiMembershipServiceContent,
  BotApiMessage,
  BotApiMessageContent,
  BotApiMessageEntity,
  BotApiMyChatMemberUpdated,
  BotApiPhotoSize,
  BotApiPrivateChat,
  BotApiPrivateChatBotMember,
  BotApiPrivateMessage,
  BotApiRepliedPrivateMessage,
  BotApiRepliedSupergroupMessage,
  BotApiSupergroupAdministratorRights,
  BotApiSupergroupChat,
  BotApiSupergroupMessage,
  BotApiSupergroupMessageContent,
  BotApiUser,
} from '../types/bot_api.ts';
import type { CallbackQuery } from '../types/callback_query.ts';
import type {
  BotBlockChangedEvent,
  ChatMemberStatusChangedEvent,
} from '../types/chat_domain_event.ts';
import type { ChatMemberStatus, SupergroupAdministratorRights } from '../types/chat_membership.ts';
import type { InlineKeyboard, InlineKeyboardButton } from '../types/inline_keyboard.ts';
import type { StoredFile } from '../types/stored_file.ts';
import type { VirtualAccountProfile } from '../types/virtual_account.ts';
import type { VirtualBotProfile } from '../types/virtual_bot.ts';
import type { BasicGroup, Supergroup } from '../types/virtual_chat.ts';
import type {
  ChatMessage,
  FormattedText,
  MembershipServiceContent,
  MessageContent,
  PrivateMessage,
  SupergroupMessage,
  SupergroupMessageContent,
  TextEntity,
} from '../types/virtual_message.ts';

/** A stored file with the `file_id` by which the observer of a projection knows it. */
export interface ObservedFile {
  readonly file: StoredFile;
  readonly observerFileId: string;
}

/** What a projection shows beyond the message itself, resolved for the observer. */
interface MessageProjectionContext {
  /** The user the projection is for. */
  readonly observerId: number;
  /** Every user the message's text or caption mentions, by ID. */
  readonly mentionedUsers: ReadonlyMap<number, BotApiUser>;
  /** The file of a photo or document message; omitted for other messages. */
  readonly contentFile?: ObservedFile;
  /**
   * The members that joined or left, in the order a service message names them; omitted for
   * other messages.
   */
  readonly changedMembers?: readonly BotApiUser[];
}

export interface PrivateMessageForBotProjectionInput {
  readonly message: PrivateMessage;
  /** The conversation's account, which is the observing bot's private-chat peer. */
  readonly account: VirtualAccountProfile;
  /** The conversation's bot, which observes the message. */
  readonly bot: VirtualBotProfile;
  /** The message's ID in the observing bot's message box. */
  readonly observerMessageId: number;
  readonly context: MessageProjectionContext;
  /** The replied message as the observing bot sees it; omitted when there is none to show. */
  readonly repliedMessage?: BotApiRepliedPrivateMessage;
}

/**
 * Projects a canonical private message as seen by the bot of its conversation, in the field
 * order Telegram uses.
 *
 * The chat is always the account, whoever wrote the message; the sender follows the author.
 */
export function projectPrivateMessageForBot(
  { message, account, bot, observerMessageId, context, repliedMessage }:
    PrivateMessageForBotProjectionInput,
): BotApiPrivateMessage {
  return {
    message_id: observerMessageId,
    from: message.authorRole === 'account' ? account : projectBotAsUser(bot),
    chat: projectPrivateChat(account),
    date: message.sentAtUnixSeconds,
    ...projectMessageBody(message, projectMessageContent(message.content, context), repliedMessage),
  };
}

export interface SupergroupMessageProjectionInput {
  readonly message: SupergroupMessage;
  readonly supergroup: Supergroup;
  /** The member who wrote the message. */
  readonly author: BotApiUser;
  /** The message's ID in the supergroup's message box, which every member sees. */
  readonly messageId: number;
  readonly context: MessageProjectionContext;
  /** The replied message; omitted when there is none to show. */
  readonly repliedMessage?: BotApiRepliedSupergroupMessage;
}

/**
 * Projects a canonical supergroup message, in the field order Telegram uses. A supergroup numbers
 * its messages once, so members see the same projection, apart from the `file_id` of its file and
 * the legacy `new_chat_member` field of a service message.
 */
export function projectSupergroupMessage(
  { message, supergroup, author, messageId, context, repliedMessage }:
    SupergroupMessageProjectionInput,
): BotApiSupergroupMessage {
  return {
    message_id: messageId,
    from: author,
    chat: projectSupergroupChat(supergroup),
    date: message.sentAtUnixSeconds,
    ...projectMessageBody(
      message,
      projectSupergroupMessageContent(message.content, context),
      repliedMessage,
    ),
  };
}

/**
 * Projects the fields that follow a message's date, which every chat type shows alike, with the
 * given projection of its content.
 */
function projectMessageBody<Content extends BotApiSupergroupMessageContent, RepliedMessage>(
  message: ChatMessage,
  content: Content,
  repliedMessage: RepliedMessage | undefined,
) {
  return {
    ...(message.contentEditedAtUnixSeconds === undefined
      ? {}
      : { edit_date: message.contentEditedAtUnixSeconds }),
    ...(repliedMessage === undefined ? {} : { reply_to_message: repliedMessage }),
    ...content,
    ...(message.inlineKeyboard === undefined
      ? {}
      : { reply_markup: projectInlineKeyboardMarkup(message.inlineKeyboard) }),
    ...(message.isContentProtected ? { has_protected_content: true as const } : {}),
  };
}

function projectSupergroupMessageContent(
  content: SupergroupMessageContent,
  context: MessageProjectionContext,
): BotApiSupergroupMessageContent {
  return content.kind === 'members_joined' || content.kind === 'member_left'
    ? projectMembershipServiceContent(content, context)
    : projectMessageContent(content, context);
}

/** Projects a membership change with the members the context resolved for it. */
function projectMembershipServiceContent(
  content: MembershipServiceContent,
  { observerId, changedMembers }: MessageProjectionContext,
): BotApiMembershipServiceContent {
  const [firstMember] = changedMembers ?? [];
  if (firstMember === undefined) {
    throw new Error('Expected the members of the service message to be provided');
  }
  if (content.kind === 'member_left') {
    return { left_chat_participant: firstMember, left_chat_member: firstMember };
  }
  const newChatMember = changedMembers?.find((member) => member.id === observerId) ?? firstMember;
  return {
    new_chat_participant: newChatMember,
    new_chat_member: newChatMember,
    new_chat_members: changedMembers ?? [],
  };
}

function projectMessageContent(
  content: MessageContent,
  { mentionedUsers, contentFile }: MessageProjectionContext,
): BotApiMessageContent {
  switch (content.kind) {
    case 'text':
      return {
        text: content.text,
        ...(content.entities.length === 0 ? {} : {
          entities: content.entities.map((entity) => projectTextEntity(entity, mentionedUsers)),
        }),
      };
    case 'photo': {
      const hasCaption = content.caption.text.length > 0;
      return {
        photo: [projectPhotoSize(contentFile)],
        ...projectCaption(content.caption, mentionedUsers),
        ...(hasCaption && content.showsCaptionAboveMedia
          ? { show_caption_above_media: true as const }
          : {}),
        ...(content.hasSpoiler ? { has_media_spoiler: true as const } : {}),
      };
    }
    case 'document':
      return {
        document: projectDocument(contentFile),
        ...projectCaption(content.caption, mentionedUsers),
      };
    default: {
      const unhandledContent: never = content;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

/** Telegram omits the caption fields of a media message without a caption. */
function projectCaption(caption: FormattedText, mentionedUsers: ReadonlyMap<number, BotApiUser>) {
  if (caption.text.length === 0) {
    return {};
  }
  return {
    caption: caption.text,
    ...(caption.entities.length === 0 ? {} : {
      caption_entities: caption.entities.map((entity) => projectTextEntity(entity, mentionedUsers)),
    }),
  };
}

/** Shows a photo in its one kept size; the observed file must be the message's photo. */
function projectPhotoSize(contentFile: ObservedFile | undefined): BotApiPhotoSize {
  const file = contentFile?.file;
  if (contentFile === undefined || file?.type !== 'photo') {
    throw new Error('Expected the photo of the message to be provided');
  }
  return {
    file_id: contentFile.observerFileId,
    file_unique_id: file.uniqueId,
    file_size: file.content.length,
    width: file.width,
    height: file.height,
  };
}

/** Shows a document; the observed file must be the message's document. */
function projectDocument(contentFile: ObservedFile | undefined): BotApiDocument {
  const file = contentFile?.file;
  if (contentFile === undefined || file?.type !== 'document') {
    throw new Error('Expected the document of the message to be provided');
  }
  return {
    file_name: file.fileName,
    mime_type: file.mimeType,
    file_id: contentFile.observerFileId,
    file_unique_id: file.uniqueId,
    file_size: file.content.length,
  };
}

export interface CallbackQueryForBotProjectionInput {
  readonly callbackQuery: CallbackQuery;
  /** The account that pressed the button. */
  readonly account: VirtualAccountProfile;
  /** The message carrying the pressed button, as the observing bot currently sees it. */
  readonly message: BotApiMessage;
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

export interface BotMembershipChangeProjectionInput {
  readonly event: ChatMemberStatusChangedEvent;
  readonly chat: BasicGroup | Supergroup;
  /** The user that made the change: the bot itself when it left. */
  readonly actor: BotApiUser;
  /** The bot whose membership changed, which observes the change. */
  readonly bot: VirtualBotProfile;
}

/** Projects a change of a bot's standing in a group as the bot receives it. */
export function projectBotMembershipChangeForBot(
  { event, chat, actor, bot }: BotMembershipChangeProjectionInput,
): BotApiMyChatMemberUpdated {
  const user = projectBotAsUser(bot);
  return {
    chat: projectGroupChat(chat),
    from: actor,
    date: event.changedAtUnixSeconds,
    old_chat_member: projectGroupChatBotMember(user, event.oldStatus),
    new_chat_member: projectGroupChatBotMember(user, event.newStatus),
  };
}

function projectGroupChatBotMember(
  user: BotApiBotUser,
  status: ChatMemberStatus,
): BotApiGroupChatBotMember {
  const member = projectChatMember(user, status);
  if (member.status === 'creator') {
    throw new Error(`Bot ${user.id} cannot own a group`);
  }
  return member;
}

/**
 * Projects a user's standing in a group as the Bot API shows it to a bot. Bots never promote
 * administrators here, so no bot may change an administrator's rights.
 */
export function projectChatMember<User extends BotApiUser>(
  user: User,
  status: ChatMemberStatus,
): BotApiChatMember<User> {
  switch (status.status) {
    case 'owner':
      return { user, status: 'creator', is_anonymous: false };
    case 'administrator':
      return {
        user,
        status: 'administrator',
        can_be_edited: false,
        ...projectSupergroupAdministratorRights(status.rights),
        can_manage_voice_chats: status.rights.has('can_manage_video_chats'),
      };
    case 'member':
    case 'left':
      return { user, status: status.status };
    case 'kicked':
      return { user, status: 'kicked', until_date: status.bannedUntilUnixSeconds ?? 0 };
    default: {
      const unhandledStatus: never = status;
      throw new Error(`Unhandled chat member status: ${JSON.stringify(unhandledStatus)}`);
    }
  }
}

/** Shows every supergroup right, held or not, in the order the Bot API shows them. */
function projectSupergroupAdministratorRights(
  rights: SupergroupAdministratorRights,
): BotApiSupergroupAdministratorRights {
  return {
    can_manage_chat: rights.has('can_manage_chat'),
    can_change_info: rights.has('can_change_info'),
    can_delete_messages: rights.has('can_delete_messages'),
    can_invite_users: rights.has('can_invite_users'),
    can_restrict_members: rights.has('can_restrict_members'),
    can_pin_messages: rights.has('can_pin_messages'),
    can_manage_topics: rights.has('can_manage_topics'),
    can_promote_members: rights.has('can_promote_members'),
    can_manage_video_chats: rights.has('can_manage_video_chats'),
    can_post_stories: rights.has('can_post_stories'),
    can_edit_stories: rights.has('can_edit_stories'),
    can_delete_stories: rights.has('can_delete_stories'),
    can_manage_tags: rights.has('can_manage_tags'),
    can_send_welcome_messages: rights.has('can_send_welcome_messages'),
    is_anonymous: false,
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
