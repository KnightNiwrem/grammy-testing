import { getMessageOrigin } from './message_forward.ts';
import {
  type ContentMessage,
  type ExternalReply,
  type FormattedText,
  getContentText,
  type TextEntity,
  type TextQuote,
} from './virtual_message.ts';

/**
 * The most characters of a replied text or caption that Telegram quotes automatically, as TDLib's
 * `message_reply_quote_length_max` option sets it.
 */
const MAX_AUTOMATIC_QUOTE_LENGTH = 1_024;

/** The entity types Telegram keeps in a quote, as TDLib's `is_allowed_quote_entity_type` lists them. */
const QUOTE_ENTITY_TYPES: ReadonlySet<TextEntity['type']> = new Set([
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
  'custom_emoji',
  'date_time',
]);

/** A reply to a message of another chat, with the quote Telegram shows with it. */
export interface ExternalReplyWithQuote {
  readonly externalReply: ExternalReply;
  /** Omitted when the replied message has no text or caption to quote. */
  readonly quote?: TextQuote;
}

/**
 * Creates what a reply to a message of another chat shows of it, as TDLib's `RepliedMessageInfo`
 * does for a reply being sent: the replied message's origin, its supergroup message ID, and its
 * media, with its text or caption as an automatic quote. `messageIdInChat` is the replied message's
 * ID in its chat, which Telegram shows only for a supergroup message.
 */
export function createExternalReply(
  repliedMessage: ContentMessage,
  messageIdInChat: number,
): ExternalReplyWithQuote {
  const { content } = repliedMessage;
  const quote = createAutomaticQuote(getContentText(content));
  const externalReply: ExternalReply = {
    origin: getMessageOrigin(repliedMessage),
    ...(repliedMessage.kind === 'supergroup_message'
      ? { supergroupMessage: { chatId: repliedMessage.chatId, messageId: messageIdInChat } }
      : {}),
    ...(content.kind === 'text'
      ? {}
      : { media: { ...content, caption: { text: '', entities: [] } } }),
  };
  return { externalReply, ...(quote === undefined ? {} : { quote }) };
}

/**
 * Quotes a replied text or caption as Telegram does when the sender chose no quote: from its
 * start, truncated to Telegram's length as TDLib's `truncate_formatted_text` does, and with only
 * the entities Telegram allows in quotes. Returns `undefined` for empty text.
 */
function createAutomaticQuote({ text, entities }: FormattedText): TextQuote | undefined {
  if (text.length === 0) {
    return undefined;
  }
  const quotedText = [...text].slice(0, MAX_AUTOMATIC_QUOTE_LENGTH).join('');
  const quotedLength = quotedText.length;
  const quotedEntities = entities.flatMap((entity): TextEntity[] => {
    if (!QUOTE_ENTITY_TYPES.has(entity.type) || entity.offset >= quotedLength) {
      return [];
    }
    if (entity.offset + entity.length <= quotedLength) {
      return [entity];
    }
    // A custom emoji cannot be cut; other entities end with the quote.
    return entity.type === 'custom_emoji'
      ? []
      : [{ ...entity, length: quotedLength - entity.offset }];
  });
  return { text: { text: quotedText, entities: quotedEntities }, position: 0, isManual: false };
}
