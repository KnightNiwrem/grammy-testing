import type {
  InlineKeyboard,
  InlineKeyboardButton,
  InlineQuerySwitchTarget,
} from './inline_keyboard.ts';
import {
  type ChatMessage,
  type ContentMessage,
  getMessageAuthorId,
  hasProtectedContent,
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
 * Whether Telegram lets a user forward a message: only content can be forwarded, and not when it
 * is protected, by its sender or by its chat. Bots may still copy protected content, which clients
 * cannot.
 */
export function isForwardable(
  message: ChatMessage,
  chatProtectsContent: boolean,
): message is ContentMessage {
  return isContentMessage(message) && !hasProtectedContent(message, chatProtectsContent);
}

/**
 * Creates the forward of a message as TDLib's `forward_messages_impl` does: the forward repeats the
 * content and the inline bot it was sent through, and shows who first sent it and when; a forward
 * of a forward shows the original's origin. The forward keeps the inline keyboard as
 * `forwardInlineKeyboard` decides.
 */
export function createMessageForward(
  message: ContentMessage,
  getPrivateForwardName: PrivateForwardNameLookup,
): MessageForward {
  const forwardInfo = getMessageOrigin(message, getPrivateForwardName);
  const inlineKeyboard = message.inlineKeyboard === undefined
    ? undefined
    : forwardInlineKeyboard(message.inlineKeyboard, message.viaBot !== undefined);
  return {
    content: message.content,
    forwardInfo,
    ...(inlineKeyboard === undefined ? {} : { inlineKeyboard }),
  };
}

const EVERY_INLINE_QUERY_CHAT: InlineQuerySwitchTarget = {
  kind: 'chosen_chat',
  chatTypes: {
    allowsUserChats: true,
    allowsBotChats: true,
    allowsGroupChats: true,
    allowsChannelChats: true,
  },
};

/**
 * The inline keyboard a forward shows, as TDLib's `dup_reply_markup` decides: the forward keeps the
 * keyboard only when every button still works away from the original message, and drops it
 * otherwise. URL, copy-text and disabled buttons work anywhere. Switch-inline buttons of a message
 * sent through an inline bot work too, and let the user choose any chat, since the forward's chat
 * is not the original's. TDLib keeps a disabled button without its text, which the emulator keeps.
 */
function forwardInlineKeyboard(
  inlineKeyboard: InlineKeyboard,
  isSentViaBot: boolean,
): InlineKeyboard | undefined {
  const forwardedRows: InlineKeyboardButton[][] = [];
  for (const row of inlineKeyboard) {
    const forwardedRow: InlineKeyboardButton[] = [];
    for (const button of row) {
      switch (button.kind) {
        case 'url':
        case 'copy_text':
        case 'disabled':
          forwardedRow.push(button);
          break;
        case 'switch_inline_query':
          if (!isSentViaBot) {
            return undefined;
          }
          forwardedRow.push(
            button.target.kind === 'current_chat'
              ? { ...button, target: EVERY_INLINE_QUERY_CHAT }
              : button,
          );
          break;
        case 'callback':
          return undefined;
        default: {
          const unhandledButton: never = button;
          throw new Error(`Unhandled inline keyboard button: ${JSON.stringify(unhandledButton)}`);
        }
      }
    }
    forwardedRows.push(forwardedRow);
  }
  return forwardedRows;
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
