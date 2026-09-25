import type { InlineKeyboard } from './inline_keyboard.ts';
import type { StoredFileId } from './stored_file.ts';
import type { MessageContent } from './virtual_message.ts';

/** Telegram's decimal text form of a 64-bit inline query identifier. */
export type InlineQueryId = string;

/** The most characters of query text that Telegram's clients send. */
export const MAX_INLINE_QUERY_LENGTH = 256;

/** The most results TDLib accepts in one answer to an inline query. */
export const MAX_INLINE_QUERY_RESULT_COUNT = 50;

/** The most UTF-8 bytes of a result identifier or `next_offset` that Telegram accepts. */
export const MAX_INLINE_QUERY_RESULT_ID_BYTES = 64;
export const MAX_INLINE_QUERY_NEXT_OFFSET_BYTES = 64;

/** The most characters of a `start_parameter` that TDLib accepts. */
export const MAX_START_PARAMETER_LENGTH = 64;

/**
 * The chat where an account typed an inline query, which is where the result it chooses is sent:
 * its private chat with a bot, the inline bot or another, or a supergroup it is a member of.
 */
export type InlineQueryChat =
  | { readonly type: 'private'; readonly botId: number }
  | { readonly type: 'supergroup'; readonly chatId: number };

interface InlineQueryResultBase {
  /** The bot's identifier of the result, unique within its answer. */
  readonly id: string;
  /** What choosing the result sends to the chat. */
  readonly messageContent: MessageContent;
  /** Omitted when the sent message has no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

/** A result that the account's client lists by its title, with a text message to send. */
export interface ArticleInlineQueryResult extends InlineQueryResultBase {
  readonly kind: 'article';
  /** Never empty. */
  readonly title: string;
  /** Omitted when empty. */
  readonly description?: string;
  /** The URL the client shows with the result; omitted for none. */
  readonly url?: string;
}

/** A photo the bot knows by its `file_id`, which the client lists as the photo. */
export interface PhotoInlineQueryResult extends InlineQueryResultBase {
  readonly kind: 'photo';
  readonly fileId: StoredFileId;
  /** Omitted when empty. */
  readonly title?: string;
  /** Omitted when empty. */
  readonly description?: string;
}

/** A document the bot knows by its `file_id`, which the client lists by its title. */
export interface DocumentInlineQueryResult extends InlineQueryResultBase {
  readonly kind: 'document';
  readonly fileId: StoredFileId;
  /** Never empty. */
  readonly title: string;
  /** Omitted when empty. */
  readonly description?: string;
}

/**
 * A result of an answer to an inline query. The Bot API's other result types, and results with
 * files given by URL, are not supported.
 */
export type InlineQueryResult =
  | ArticleInlineQueryResult
  | PhotoInlineQueryResult
  | DocumentInlineQueryResult;

/**
 * The button the account's client shows above the results: it opens the bot's private chat with a
 * `/start` parameter, or a Web App.
 */
export type InlineQueryResultsButton =
  | { readonly kind: 'start_bot'; readonly text: string; readonly startParameter: string }
  | { readonly kind: 'web_app'; readonly text: string; readonly url: string };

/** How the bot answered an inline query, as the querying account's client shows it. */
export interface InlineQueryAnswer {
  readonly results: readonly InlineQueryResult[];
  /** How long the answer is reused for the same query instead of asking the bot again. */
  readonly cacheTimeSeconds: number;
  /** Whether the answer is reused only for the account that sent the query. */
  readonly isPersonal: boolean;
  /** The offset the client sends to request more results; empty when there are no more. */
  readonly nextOffset: string;
  /** Omitted when the client shows no button. */
  readonly button?: InlineQueryResultsButton;
}

/**
 * Where an inline query is in its life. The bot answers a query once, unless it was answered from
 * the cache; the emulator does not expire queries by time.
 */
export type InlineQueryState =
  | { readonly status: 'awaiting_answer' }
  | {
    readonly status: 'answered';
    readonly answer: InlineQueryAnswer;
    /**
     * When the bot gave the answer, which may be before the query for an answer reused from the
     * cache; the answer is reused until `answer.cacheTimeSeconds` after it.
     */
    readonly answeredAtMilliseconds: number;
  };

/** Text an account typed after a bot's username, which asks the bot for results to send. */
export interface InlineQuery {
  readonly id: InlineQueryId;
  /** The account that sent the query. */
  readonly accountId: number;
  /** The inline bot, which receives and answers the query. */
  readonly botId: number;
  readonly chat: InlineQueryChat;
  /** Up to 256 characters; empty when the account typed only the bot's username. */
  readonly query: string;
  /** The `next_offset` of an earlier answer, requesting more results; empty for the first. */
  readonly offset: string;
  readonly state: InlineQueryState;
}

/**
 * The Bot API `chat_type` of an inline query's chat: `sender` for the account's private chat with
 * the inline bot itself.
 */
export function getInlineQueryChatType(
  { botId, chat }: Pick<InlineQuery, 'botId' | 'chat'>,
): 'sender' | 'private' | 'supergroup' {
  if (chat.type === 'supergroup') {
    return 'supergroup';
  }
  return chat.botId === botId ? 'sender' : 'private';
}

/**
 * Whether two queries ask a bot the same, so that an answer to one can be reused for the other.
 * As TDLib's `InlineQueriesManager::send_inline_query` identifies a query, they must be sent to
 * the same bot from the same kind of chat, with the same offset and the same text apart from
 * surrounding ASCII whitespace.
 */
export function isSameInlineQueryRequest(
  first: Pick<InlineQuery, 'botId' | 'chat' | 'query' | 'offset'>,
  second: Pick<InlineQuery, 'botId' | 'chat' | 'query' | 'offset'>,
): boolean {
  return first.botId === second.botId &&
    getInlineQueryChatType(first) === getInlineQueryChatType(second) &&
    trimTdlibWhitespace(first.query) === trimTdlibWhitespace(second.query) &&
    first.offset === second.offset;
}

/** Removes the characters that TDLib's `trim` treats as whitespace from both ends. */
function trimTdlibWhitespace(text: string): string {
  return text.replace(/^[ \t\r\n\0\v]+|[ \t\r\n\0\v]+$/g, '');
}

/** Finds the result the account chose in an answer by its identifier. */
export function findInlineQueryResult(
  answer: InlineQueryAnswer,
  resultId: string,
): InlineQueryResult | undefined {
  return answer.results.find((result) => result.id === resultId);
}
