import type { InlineKeyboard } from './inline_keyboard.ts';
import {
  type ChatMessage,
  type ContentMessage,
  getMessageAuthorId,
  isContentMessage,
  type MessageContent,
  type MessageForwardInfo,
} from './virtual_message.ts';

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
export function createMessageForward(message: ContentMessage): MessageForward {
  const forwardInfo = getMessageOrigin(message);
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
 * author, date, and inline bot, or, for a forward, the original's.
 */
export function getMessageOrigin(message: ContentMessage): MessageForwardInfo {
  return message.forwardInfo ?? {
    originalSenderId: getMessageAuthorId(message),
    originalSentAtUnixSeconds: message.sentAtUnixSeconds,
    ...(message.viaBot === undefined ? {} : { viaBotId: message.viaBot.botId }),
  };
}
