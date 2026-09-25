import type { InlineKeyboard } from './inline_keyboard.ts';
import {
  type ChatMessage,
  type ContentMessage,
  getMessageAuthorId,
  isContentMessage,
  type MessageContent,
  type MessageForwardInfo,
  type MessageOriginSender,
} from './virtual_message.ts';

/**
 * Looks up the name that forwards of a user's messages show instead of linking to the user, as
 * TDLib's `get_user_private_forward_name` does; returns `undefined` for a user whose forwards link
 * to it, which every bot is.
 */
export type PrivateForwardNameLookup = (userId: number) => string | undefined;

/** What the forward of a message carries into the chat it is forwarded to. */
export interface MessageForward {
  readonly content: MessageContent;
  readonly forwardInfo: MessageForwardInfo;
  /** Omitted when the forward shows no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * Whether Telegram lets a user forward a message: only content can be forwarded, and not when its
 * sender protected it. Bots may still copy protected content, which clients cannot.
 */
export function isForwardable(message: ChatMessage): message is ContentMessage {
  return isContentMessage(message) && !message.isContentProtected;
}

/**
 * Creates the forward of a message as TDLib's `forward_messages_impl` does: the forward repeats the
 * content and the inline bot it was sent through, and shows who first sent it and when; a forward
 * of a forward shows the original's origin. As TDLib's `dup_reply_markup` does, the forward keeps
 * the inline keyboard only when every button opens a URL, because other buttons act for the
 * original message.
 */
export function createMessageForward(
  message: ContentMessage,
  getPrivateForwardName: PrivateForwardNameLookup,
): MessageForward {
  const forwardInfo = getMessageOrigin(message, getPrivateForwardName);
  const keepsInlineKeyboard = message.inlineKeyboard?.every((row) =>
    row.every((button) => button.kind === 'url')
  );
  return {
    content: message.content,
    forwardInfo,
    ...(keepsInlineKeyboard ? { inlineKeyboard: message.inlineKeyboard } : {}),
  };
}

/**
 * Where a message first appeared, as its forwards and replies from other chats show it: its own
 * author, date, and inline bot, or, for a forward, the original's. As TDLib's
 * `MessageOrigin::hide_sender_if_needed` does for both, the origin shows only the name of a sender
 * whose privacy settings keep forwards from linking to it.
 */
export function getMessageOrigin(
  message: ContentMessage,
  getPrivateForwardName: PrivateForwardNameLookup,
): MessageForwardInfo {
  const origin: MessageForwardInfo = message.forwardInfo ?? {
    originalSender: { kind: 'user', userId: getMessageAuthorId(message) },
    originalSentAtUnixSeconds: message.sentAtUnixSeconds,
    ...(message.viaBot === undefined ? {} : { viaBotId: message.viaBot.botId }),
  };
  const originalSender = hideSenderIfPrivate(origin.originalSender, getPrivateForwardName);
  return originalSender === origin.originalSender ? origin : { ...origin, originalSender };
}

function hideSenderIfPrivate(
  sender: MessageOriginSender,
  getPrivateForwardName: PrivateForwardNameLookup,
): MessageOriginSender {
  if (sender.kind === 'hidden_user') {
    return sender;
  }
  const privateForwardName = getPrivateForwardName(sender.userId);
  return privateForwardName === undefined
    ? sender
    : { kind: 'hidden_user', name: privateForwardName };
}
