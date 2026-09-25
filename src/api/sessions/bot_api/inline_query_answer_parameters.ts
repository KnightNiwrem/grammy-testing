import { z } from 'zod';

import type { InlineKeyboard } from '../../../types/inline_keyboard.ts';
import type { InlineQueryResultsButton } from '../../../types/inline_query.ts';
import { linkPreviewOptionsSchema } from './link_preview_options_parameter.ts';
import { inlineKeyboardMarkupSchema } from './reply_markup_parameter.ts';
import { jsonParameter } from './request_parameters.ts';

/** Text as a result specifies it, before its `parse_mode` or entities are read. */
export interface UnreadFormattedText {
  readonly text: string;
  readonly parseMode?: string;
  readonly entities?: readonly unknown[];
}

interface InlineQueryResultParameterBase {
  readonly id: string;
  /** Empty for none. */
  readonly description: string;
  /** Omitted for a result whose message has no inline keyboard. */
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * An inline query result as `answerInlineQuery` specifies it, before its text is read and its
 * file resolved. `messageText` is the text of its `input_message_content`.
 */
export type InlineQueryResultParameter =
  | (InlineQueryResultParameterBase & {
    readonly kind: 'article';
    readonly title: string;
    /** Empty for none, including a URL the bot asks clients to hide. */
    readonly url: string;
    readonly messageText: UnreadFormattedText;
  })
  | (InlineQueryResultParameterBase & {
    readonly kind: 'photo';
    /** The `file_id` of the photo. */
    readonly photoFileId: string;
    /** Empty for none. */
    readonly title: string;
    readonly caption: UnreadFormattedText;
    readonly showsCaptionAboveMedia: boolean;
    readonly messageText?: UnreadFormattedText;
  })
  | (InlineQueryResultParameterBase & {
    readonly kind: 'document';
    /** The `file_id` of the document. */
    readonly documentFileId: string;
    readonly title: string;
    readonly caption: UnreadFormattedText;
    readonly messageText?: UnreadFormattedText;
  });

export type InlineQueryResultsParameterReading =
  | { readonly read: true; readonly results: readonly InlineQueryResultParameter[] }
  | { readonly read: false; readonly description: string };

/** The emulator's description for a file given by URL, which Telegram downloads itself. */
const FILE_URL_UNSUPPORTED_DESCRIPTION = 'Bad Request: sending files by URL is not supported';

/** Telegram's result types that the emulator does not support. */
const UNSUPPORTED_RESULT_TYPES = [
  'audio',
  'contact',
  'game',
  'gif',
  'location',
  'mpeg4_gif',
  'sticker',
  'venue',
  'video',
  'voice',
] as const;

/**
 * Fields by which Telegram recognizes `input_message_content` of a location, venue, contact,
 * invoice, or rich message, which the emulator does not support.
 */
const UNSUPPORTED_INPUT_MESSAGE_CONTENT_FIELDS = [
  'latitude',
  'longitude',
  'phone_number',
  'payload',
  'rich_message',
] as const;

const UNSUPPORTED_INPUT_MESSAGE_CONTENT_DESCRIPTION =
  'Bad Request: inline query results sending a location, venue, contact, invoice, or rich ' +
  'message are not supported';

// TDLib reads an empty text as none, so the text of a photo or document result may be empty.
const inputTextMessageContentSchema = z.strictObject({
  message_text: z.string().default(''),
  parse_mode: z.string().optional(),
  entities: z.array(z.unknown()).optional(),
  link_preview_options: linkPreviewOptionsSchema.optional(),
  disable_web_page_preview: z.boolean().optional(),
});

/**
 * Thumbnails, which clients show in the list of results; the emulator validates and ignores
 * them.
 */
const thumbnailShape = {
  thumbnail_url: z.string().optional(),
  thumbnail_width: z.int().optional(),
  thumbnail_height: z.int().optional(),
};

const sharedResultShape = {
  type: z.string(),
  id: z.string(),
  description: z.string().default(''),
  reply_markup: inlineKeyboardMarkupSchema.optional(),
  input_message_content: inputTextMessageContentSchema.optional(),
};

const captionShape = {
  caption: z.string().default(''),
  parse_mode: z.string().optional(),
  caption_entities: z.array(z.unknown()).optional(),
};

// `hide_url` is an older option that Telegram still honors by not sending the URL.
const articleResultSchema = z.strictObject({
  ...sharedResultShape,
  ...thumbnailShape,
  title: z.string(),
  url: z.string().default(''),
  hide_url: z.boolean().default(false),
});

// Photos are covered by no spoiler in inline results. The dimensions of a photo given by URL are
// validated and ignored.
const photoResultSchema = z.strictObject({
  ...sharedResultShape,
  ...captionShape,
  photo_url: z.string().default(''),
  photo_file_id: z.string().default(''),
  photo_width: z.int().optional(),
  photo_height: z.int().optional(),
  thumbnail_url: z.string().optional(),
  title: z.string().default(''),
  show_caption_above_media: z.boolean().default(false),
});

const documentResultSchema = z.strictObject({
  ...sharedResultShape,
  ...captionShape,
  ...thumbnailShape,
  title: z.string(),
  document_url: z.string().default(''),
  document_file_id: z.string().default(''),
  mime_type: z.string().optional(),
});

/**
 * Reads the elements of an `answerInlineQuery` `results` parameter as the official Bot API
 * server's `get_inline_query_result` does, failing with Telegram's description for a result it
 * cannot read. Article, photo, and document results are supported, the latter two only with files
 * given by `file_id`; other result types and message contents fail as unsupported.
 *
 * `invalidParametersDescription` answers results that Telegram would read leniently, such as
 * numbers written as strings, which are rejected instead to surface the bot's mistake in tests.
 */
export function readInlineQueryResultsParameter(
  resultValues: readonly unknown[],
  invalidParametersDescription: string,
): InlineQueryResultsParameterReading {
  const results: InlineQueryResultParameter[] = [];
  for (const resultValue of resultValues) {
    const reading = readInlineQueryResult(resultValue);
    switch (reading.kind) {
      case 'result':
        results.push(reading.result);
        break;
      case 'failure':
        return { read: false, description: reading.description };
      case 'malformed':
        return { read: false, description: invalidParametersDescription };
      default: {
        const unhandledReading: never = reading;
        throw new Error(
          `Unhandled inline query result reading: ${JSON.stringify(unhandledReading)}`,
        );
      }
    }
  }
  return { read: true, results };
}

type InlineQueryResultReading =
  | { readonly kind: 'result'; readonly result: InlineQueryResultParameter }
  | { readonly kind: 'failure'; readonly description: string }
  | { readonly kind: 'malformed' };

/** Reads one `InlineQueryResult` object, matching its type case-insensitively as Telegram does. */
function readInlineQueryResult(value: unknown): InlineQueryResultReading {
  const typeReading = z.looseObject({ type: z.string() }).safeParse(value);
  if (!typeReading.success) {
    return { kind: 'malformed' };
  }
  const type = typeReading.data.type.toLowerCase();
  if ((UNSUPPORTED_RESULT_TYPES as readonly string[]).includes(type)) {
    return {
      kind: 'failure',
      description: `Bad Request: inline query results of type "${type}" are not supported`,
    };
  }
  if (type !== 'article' && type !== 'photo' && type !== 'document') {
    return {
      kind: 'failure',
      description:
        `Bad Request: can't parse InlineQueryResult: type "${type}" is unsupported for the inline query result`,
    };
  }
  const inputMessageContent = z.looseObject({ input_message_content: z.looseObject({}) })
    .safeParse(value);
  if (
    inputMessageContent.success &&
    UNSUPPORTED_INPUT_MESSAGE_CONTENT_FIELDS.some((field) =>
      field in inputMessageContent.data.input_message_content
    )
  ) {
    return { kind: 'failure', description: UNSUPPORTED_INPUT_MESSAGE_CONTENT_DESCRIPTION };
  }

  switch (type) {
    case 'article':
      return readArticleResult(value);
    case 'photo':
      return readPhotoResult(value);
    case 'document':
      return readDocumentResult(value);
    default: {
      const unhandledType: never = type;
      throw new Error(`Unhandled inline query result type: ${unhandledType}`);
    }
  }
}

function readArticleResult(value: unknown): InlineQueryResultReading {
  const parsing = articleResultSchema.safeParse(value);
  if (!parsing.success) {
    return { kind: 'malformed' };
  }
  const { data } = parsing;
  const messageText = readMessageText(data.input_message_content);
  // An article sends only the text of its `input_message_content`, which it requires.
  if (messageText === undefined) {
    return {
      kind: 'failure',
      description:
        "Bad Request: can't parse InlineQueryResult: Input message content is not specified",
    };
  }
  return {
    kind: 'result',
    result: {
      kind: 'article',
      ...readSharedFields(data),
      title: data.title,
      url: data.hide_url ? '' : data.url,
      messageText,
    },
  };
}

function readPhotoResult(value: unknown): InlineQueryResultReading {
  const parsing = photoResultSchema.safeParse(value);
  if (!parsing.success) {
    return { kind: 'malformed' };
  }
  const { data } = parsing;
  const fileReading = readResultFile(data.photo_url, data.photo_file_id);
  if (fileReading.kind !== 'file_id') {
    return fileReading;
  }
  const messageText = readMessageText(data.input_message_content);
  return {
    kind: 'result',
    result: {
      kind: 'photo',
      ...readSharedFields(data),
      photoFileId: fileReading.fileId,
      title: data.title,
      caption: readCaption(data),
      showsCaptionAboveMedia: data.show_caption_above_media,
      ...(messageText === undefined ? {} : { messageText }),
    },
  };
}

function readDocumentResult(value: unknown): InlineQueryResultReading {
  const parsing = documentResultSchema.safeParse(value);
  if (!parsing.success) {
    return { kind: 'malformed' };
  }
  const { data } = parsing;
  const fileReading = readResultFile(data.document_url, data.document_file_id);
  if (fileReading.kind !== 'file_id') {
    return fileReading;
  }
  const messageText = readMessageText(data.input_message_content);
  return {
    kind: 'result',
    result: {
      kind: 'document',
      ...readSharedFields(data),
      documentFileId: fileReading.fileId,
      title: data.title,
      caption: readCaption(data),
      ...(messageText === undefined ? {} : { messageText }),
    },
  };
}

function readSharedFields(
  { id, description, reply_markup }: {
    readonly id: string;
    readonly description: string;
    readonly reply_markup?: InlineKeyboard;
  },
) {
  return {
    id,
    description,
    ...(reply_markup === undefined ? {} : { inlineKeyboard: reply_markup }),
  };
}

/**
 * Reads the file of a photo or document result as TDLib does: a URL, if given, takes the place of
 * the `file_id`, and text with a dot is a URL, which `file_id` values never contain.
 */
function readResultFile(
  url: string,
  fileId: string,
):
  | { readonly kind: 'file_id'; readonly fileId: string }
  | Exclude<InlineQueryResultReading, { readonly kind: 'result' }> {
  const file = url.length > 0 ? url : fileId;
  if (file.length === 0) {
    return { kind: 'malformed' };
  }
  return file.includes('.')
    ? { kind: 'failure', description: FILE_URL_UNSUPPORTED_DESCRIPTION }
    : { kind: 'file_id', fileId: file };
}

/** The text an `input_message_content` sends, or `undefined` for none, as TDLib reads it. */
function readMessageText(
  inputMessageContent: z.infer<typeof inputTextMessageContentSchema> | undefined,
): UnreadFormattedText | undefined {
  if (inputMessageContent === undefined || inputMessageContent.message_text.length === 0) {
    return undefined;
  }
  const { message_text, parse_mode, entities } = inputMessageContent;
  return {
    text: message_text,
    ...(parse_mode === undefined ? {} : { parseMode: parse_mode }),
    ...(entities === undefined ? {} : { entities }),
  };
}

function readCaption(
  { caption, parse_mode, caption_entities }: {
    readonly caption: string;
    readonly parse_mode?: string;
    readonly caption_entities?: readonly unknown[];
  },
): UnreadFormattedText {
  return {
    text: caption,
    ...(parse_mode === undefined ? {} : { parseMode: parse_mode }),
    ...(caption_entities === undefined ? {} : { entities: caption_entities }),
  };
}

// Telegram requires Web App URLs to use HTTPS.
const inlineQueryResultsButtonSchema = z.union([
  z.strictObject({ text: z.string(), start_parameter: z.string() }).transform((
    { text, start_parameter },
  ): InlineQueryResultsButton => ({ kind: 'start_bot', text, startParameter: start_parameter })),
  z.strictObject({
    text: z.string(),
    web_app: z.strictObject({
      url: z.url({ protocol: /^https$/ }),
    }),
  }).transform(({ text, web_app }): InlineQueryResultsButton => ({
    kind: 'web_app',
    text,
    url: web_app.url,
  })),
]);

/**
 * A `button` parameter of `answerInlineQuery`: a JSON `InlineQueryResultsButton` that opens the
 * bot's private chat with a start parameter or a Web App. As on Telegram, it has exactly one of
 * them.
 */
export function inlineQueryResultsButtonParameter() {
  return jsonParameter(inlineQueryResultsButtonSchema);
}
