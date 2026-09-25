import {
  type EmptyTextTreatment,
  fixFormattedText,
  type FormattedTextFixingContext,
} from '../text_entities/formatted_text.ts';
import { areTextEntitiesEqual } from '../text_entities/text_entity_equality.ts';
import { type InlineKeyboard, MAX_CALLBACK_DATA_BYTES } from '../types/inline_keyboard.ts';
import type {
  DocumentUpload,
  FileUpload,
  PhotoUpload,
  StoredDocumentFile,
  StoredFile,
  StoredFileId,
  StoredPhotoFile,
} from '../types/stored_file.ts';
import {
  type FormattedText,
  MAX_CAPTION_LENGTH,
  MAX_TEXT_MESSAGE_LENGTH,
  type MessageContent,
  type TextEntity,
} from '../types/virtual_message.ts';

// Telegram's rules for the content of messages, which apply alike in every chat type.

/**
 * Telegram rejected the text or its entities while normalizing them, for example because only
 * whitespace remains or an entity ends past the text. `textError` is TDLib's own description.
 */
export interface TextInvalidFailure {
  readonly reason: 'text_invalid';
  readonly textError: string;
}

/** Who writes a message, which decides how Telegram treats a caption without visible content. */
export type MessageSenderKind = 'account' | 'bot';

/** A file a new message carries: one the sender reuses by its `file_id`, or a new upload. */
export type OutgoingFile<Stored extends StoredFile, Upload extends FileUpload> =
  | { readonly kind: 'stored'; readonly file: Stored }
  | { readonly kind: 'upload'; readonly upload: Upload };

export type OutgoingPhoto = OutgoingFile<StoredPhotoFile, PhotoUpload>;

export type OutgoingDocument = OutgoingFile<StoredDocumentFile, DocumentUpload>;

/** A caption as its sender specified it, before Telegram's normalization. */
export interface SpecifiedCaption {
  /** Empty for no caption. */
  readonly caption: string;
  /** Formatting the sender specified; omitted for none. */
  readonly captionEntities?: readonly TextEntity[];
}

/** The content a sender specified for a new message, before Telegram's normalization. */
export type OutgoingMessageContent =
  | {
    readonly kind: 'text';
    /** Nonempty text, which senders check before anything else, as Telegram does. */
    readonly text: string;
    /** Formatting the sender specified; omitted for none. */
    readonly entities?: readonly TextEntity[];
  }
  | (SpecifiedCaption & {
    readonly kind: 'photo';
    readonly photo: OutgoingPhoto;
    readonly hasSpoiler: boolean;
    readonly showsCaptionAboveMedia: boolean;
  })
  | (SpecifiedCaption & {
    readonly kind: 'document';
    readonly document: OutgoingDocument;
  });

/** New message content that passed Telegram's checks, whose upload is not yet stored. */
export type NormalizedOutgoingContent =
  | Extract<MessageContent, { readonly kind: 'text' }>
  | {
    readonly kind: 'photo';
    readonly photo: OutgoingPhoto;
    readonly caption: FormattedText;
    readonly hasSpoiler: boolean;
    readonly showsCaptionAboveMedia: boolean;
  }
  | {
    readonly kind: 'document';
    readonly document: OutgoingDocument;
    readonly caption: FormattedText;
  };

export type ContentNormalizationFailure =
  | TextInvalidFailure
  | { readonly reason: 'message_text_too_long' | 'caption_too_long' };

export type OutgoingContentNormalization =
  | { readonly normalized: true; readonly content: NormalizedOutgoingContent }
  | { readonly normalized: false; readonly failure: ContentNormalizationFailure };

/**
 * Normalizes the text or caption of new message content, with the entities its sender specified,
 * as Telegram does, which also marks bot commands; then checks that the result fits in a message.
 */
export function normalizeOutgoingContent(
  content: OutgoingMessageContent,
  sender: MessageSenderKind,
  context: FormattedTextFixingContext,
): OutgoingContentNormalization {
  if (content.kind === 'text') {
    const textNormalization = normalizeMessageText(content.text, content.entities ?? [], context);
    return textNormalization.normalized
      ? { normalized: true, content: { kind: 'text', ...textNormalization.formattedText } }
      : textNormalization;
  }

  const captionNormalization = normalizeCaption(content, sender, context);
  if (!captionNormalization.normalized) {
    return captionNormalization;
  }
  const { caption } = captionNormalization;
  return {
    normalized: true,
    content: content.kind === 'photo'
      ? {
        kind: 'photo',
        photo: content.photo,
        caption,
        hasSpoiler: content.hasSpoiler,
        showsCaptionAboveMedia: content.showsCaptionAboveMedia,
      }
      : { kind: 'document', document: content.document, caption },
  };
}

type MessageTextNormalization =
  | { readonly normalized: true; readonly formattedText: FormattedText }
  | {
    readonly normalized: false;
    readonly failure: TextInvalidFailure | { readonly reason: 'message_text_too_long' };
  };

/**
 * Normalizes message text and the entities its sender specified as Telegram does, which also marks
 * bot commands, then checks that the normalized text fits in a message.
 */
function normalizeMessageText(
  text: string,
  entities: readonly TextEntity[],
  context: FormattedTextFixingContext,
): MessageTextNormalization {
  const fixing = fixFormattedText(text, entities, context);
  if (!fixing.fixed) {
    return { normalized: false, failure: { reason: 'text_invalid', textError: fixing.error } };
  }
  if (fixing.formattedText.text.length > MAX_TEXT_MESSAGE_LENGTH) {
    return { normalized: false, failure: { reason: 'message_text_too_long' } };
  }
  return { normalized: true, formattedText: fixing.formattedText };
}

type CaptionNormalization =
  | { readonly normalized: true; readonly caption: FormattedText }
  | {
    readonly normalized: false;
    readonly failure: TextInvalidFailure | { readonly reason: 'caption_too_long' };
  };

/**
 * Normalizes a caption and the entities its sender specified as Telegram does, which also marks
 * bot commands, then checks the caption's length. A caption may be empty; how one without visible
 * content is treated depends on its sender.
 */
function normalizeCaption(
  { caption, captionEntities }: SpecifiedCaption,
  sender: MessageSenderKind,
  context: FormattedTextFixingContext,
): CaptionNormalization {
  const emptyTextTreatment: EmptyTextTreatment = sender === 'bot'
    ? 'keep_invisible_characters'
    : 'clear';
  const fixing = fixFormattedText(caption, captionEntities ?? [], context, emptyTextTreatment);
  if (!fixing.fixed) {
    return { normalized: false, failure: { reason: 'text_invalid', textError: fixing.error } };
  }
  // TDLib counts the characters of a caption, not its UTF-16 code units.
  if ([...fixing.formattedText.text].length > MAX_CAPTION_LENGTH) {
    return { normalized: false, failure: { reason: 'caption_too_long' } };
  }
  return { normalized: true, caption: fixing.formattedText };
}

/**
 * What an account sends: text, or media with a caption, which is a photo or a document as its
 * upload says.
 */
export type AccountMessageContent =
  | { readonly kind: 'text'; readonly text: string }
  | {
    readonly kind: 'media';
    readonly upload: FileUpload;
    /** Empty for no caption. */
    readonly caption: string;
  };

/**
 * Turns what an account sends into outgoing content. An account writes plain text, which its
 * client normalizes as Telegram does, and never covers a photo or moves its caption.
 */
export function toOutgoingAccountContent(content: AccountMessageContent): OutgoingMessageContent {
  if (content.kind === 'text') {
    return content;
  }
  const { upload, caption } = content;
  return upload.type === 'photo'
    ? {
      kind: 'photo',
      photo: { kind: 'upload', upload },
      caption,
      hasSpoiler: false,
      showsCaptionAboveMedia: false,
    }
    : { kind: 'document', document: { kind: 'upload', upload }, caption };
}

export type ContentReplacement<FailureReason extends string> =
  | { readonly replaced: true; readonly content: MessageContent }
  | {
    readonly replaced: false;
    readonly failure: { readonly reason: FailureReason } | TextInvalidFailure;
  };

/**
 * Replaces the text of a text message with nonempty text and the entities its sender specified,
 * normalized as when sending. As on Telegram, a media message has no text to replace.
 */
export function replaceMessageText(
  content: MessageContent,
  { text, entities }: { readonly text: string; readonly entities?: readonly TextEntity[] },
  context: FormattedTextFixingContext,
): ContentReplacement<'message_has_no_text' | 'message_text_too_long'> {
  if (content.kind !== 'text') {
    return { replaced: false, failure: { reason: 'message_has_no_text' } };
  }
  const textNormalization = normalizeMessageText(text, entities ?? [], context);
  return textNormalization.normalized
    ? { replaced: true, content: { kind: 'text', ...textNormalization.formattedText } }
    : { replaced: false, failure: textNormalization.failure };
}

/**
 * Replaces the caption of a media message, normalized as when sending; an empty caption removes
 * it. As on Telegram, a text message has no caption to replace, and only a photo shows its caption
 * above itself: a document ignores `showsCaptionAboveMedia`, and omitting it keeps the setting.
 */
export function replaceMessageCaption(
  content: MessageContent,
  specifiedCaption: SpecifiedCaption & { readonly showsCaptionAboveMedia?: boolean },
  sender: MessageSenderKind,
  context: FormattedTextFixingContext,
): ContentReplacement<'message_has_no_caption' | 'caption_too_long'> {
  if (content.kind === 'text') {
    return { replaced: false, failure: { reason: 'message_has_no_caption' } };
  }
  const captionNormalization = normalizeCaption(specifiedCaption, sender, context);
  if (!captionNormalization.normalized) {
    return { replaced: false, failure: captionNormalization.failure };
  }
  const { caption } = captionNormalization;
  return {
    replaced: true,
    content: content.kind === 'photo'
      ? {
        ...content,
        caption,
        showsCaptionAboveMedia: specifiedCaption.showsCaptionAboveMedia ??
          content.showsCaptionAboveMedia,
      }
      : { ...content, caption },
  };
}

/** An account's edit of its message: new text for a text message, or a new caption for media. */
export type AccountMessageEdit =
  | { readonly kind: 'text'; readonly text: string }
  | {
    readonly kind: 'caption';
    /** Empty to remove the caption. */
    readonly caption: string;
  };

/**
 * Applies an account's edit to its message's content: plain text, which its client normalizes as
 * when sending. New text must not be empty, while an empty caption removes the caption.
 */
export function replaceAccountMessageContent(
  content: MessageContent,
  edit: AccountMessageEdit,
  context: FormattedTextFixingContext,
): ContentReplacement<
  | 'message_has_no_text'
  | 'message_text_empty'
  | 'message_text_too_long'
  | 'message_has_no_caption'
  | 'caption_too_long'
> {
  if (edit.kind === 'caption') {
    return replaceMessageCaption(content, { caption: edit.caption }, 'account', context);
  }
  if (content.kind !== 'text') {
    return { replaced: false, failure: { reason: 'message_has_no_text' } };
  }
  if (edit.text.length === 0) {
    return { replaced: false, failure: { reason: 'message_text_empty' } };
  }
  return replaceMessageText(content, { text: edit.text }, context);
}

/** Stores a file upload and returns the stored file, which carries the upload's own type. */
export interface FileUploadStore {
  addFile<Upload extends FileUpload>(upload: Upload): Upload & Pick<StoredFile, 'id' | 'uniqueId'>;
}

/**
 * Stores the upload of normalized content, if it carries one, and returns the content as a
 * message holds it. Call it only once the message is certain to be stored.
 */
export function storeOutgoingContent(
  content: NormalizedOutgoingContent,
  files: FileUploadStore,
): MessageContent {
  switch (content.kind) {
    case 'text':
      return content;
    case 'photo':
      return {
        kind: 'photo',
        fileId: storeOutgoingFile(content.photo, files),
        caption: content.caption,
        hasSpoiler: content.hasSpoiler,
        showsCaptionAboveMedia: content.showsCaptionAboveMedia,
      };
    case 'document':
      return {
        kind: 'document',
        fileId: storeOutgoingFile(content.document, files),
        caption: content.caption,
      };
    default: {
      const unhandledContent: never = content;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

function storeOutgoingFile(
  file: OutgoingPhoto | OutgoingDocument,
  files: FileUploadStore,
): StoredFileId {
  return file.kind === 'stored' ? file.file.id : files.addFile(file.upload).id;
}

/**
 * Returns normalized content as a message holds it, for content whose file, if any, is already
 * stored, as when a bot reuses a file by its `file_id`. Content with an upload must be stored with
 * `storeOutgoingContent` instead.
 */
export function toContentOfStoredFile(content: NormalizedOutgoingContent): MessageContent {
  switch (content.kind) {
    case 'text':
      return content;
    case 'photo':
      return {
        kind: 'photo',
        fileId: getStoredFileId(content.photo),
        caption: content.caption,
        hasSpoiler: content.hasSpoiler,
        showsCaptionAboveMedia: content.showsCaptionAboveMedia,
      };
    case 'document':
      return {
        kind: 'document',
        fileId: getStoredFileId(content.document),
        caption: content.caption,
      };
    default: {
      const unhandledContent: never = content;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

function getStoredFileId(file: OutgoingPhoto | OutgoingDocument): StoredFileId {
  if (file.kind !== 'stored') {
    throw new Error('Expected a stored file rather than an upload');
  }
  return file.file.id;
}

/** The content of a message that a bot's edit replaces. */
interface EditableMessage {
  readonly content: MessageContent;
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * Checks a bot's edit of its message as Telegram does: the new keyboard's callback data must fit,
 * and the edit must change the content or the keyboard.
 */
export function checkBotMessageEdit(
  message: EditableMessage,
  edit: EditableMessage,
): 'callback_data_invalid' | 'message_not_modified' | undefined {
  if (edit.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(edit.inlineKeyboard)) {
    return 'callback_data_invalid';
  }
  return isSameMessageContent(edit.content, message.content) &&
      areInlineKeyboardsEqual(edit.inlineKeyboard, message.inlineKeyboard)
    ? 'message_not_modified'
    : undefined;
}

const utf8Encoder = new TextEncoder();

/** Telegram rejects a keyboard whose callback data exceeds its byte limit when UTF-8 encoded. */
export function hasOnlyValidCallbackData(inlineKeyboard: InlineKeyboard): boolean {
  return inlineKeyboard.every((row) =>
    row.every((button) =>
      button.kind !== 'callback' ||
      utf8Encoder.encode(button.callbackData).length <= MAX_CALLBACK_DATA_BYTES
    )
  );
}

/**
 * Whether an edit leaves the content as it is, which Telegram refuses. Where the caption shows is
 * part of a caption's content only while there is a caption.
 */
export function isSameMessageContent(first: MessageContent, second: MessageContent): boolean {
  switch (first.kind) {
    case 'text':
      return second.kind === 'text' && isSameFormattedText(first, second);
    case 'photo':
      return second.kind === 'photo' && first.fileId === second.fileId &&
        first.hasSpoiler === second.hasSpoiler &&
        isSameFormattedText(first.caption, second.caption) &&
        (first.caption.text.length === 0 ||
          first.showsCaptionAboveMedia === second.showsCaptionAboveMedia);
    case 'document':
      return second.kind === 'document' && first.fileId === second.fileId &&
        isSameFormattedText(first.caption, second.caption);
    default: {
      const unhandledContent: never = first;
      throw new Error(`Unhandled message content: ${JSON.stringify(unhandledContent)}`);
    }
  }
}

function isSameFormattedText(first: FormattedText, second: FormattedText): boolean {
  return first.text === second.text && areTextEntitiesEqual(first.entities, second.entities);
}

/** Whether an edit leaves the inline keyboard as it is, which Telegram refuses. */
function areInlineKeyboardsEqual(
  first: InlineKeyboard | undefined,
  second: InlineKeyboard | undefined,
): boolean {
  if (first === undefined || second === undefined) {
    return first === second;
  }
  return first.length === second.length && first.every((firstRow, rowIndex) => {
    const secondRow = second[rowIndex];
    return firstRow.length === secondRow.length && firstRow.every((firstButton, buttonIndex) => {
      const secondButton = secondRow[buttonIndex];
      switch (firstButton.kind) {
        case 'callback':
          return secondButton.kind === 'callback' && firstButton.text === secondButton.text &&
            firstButton.callbackData === secondButton.callbackData;
        case 'url':
          return secondButton.kind === 'url' && firstButton.text === secondButton.text &&
            firstButton.url === secondButton.url;
        default: {
          const unhandledButton: never = firstButton;
          throw new Error(`Unhandled inline keyboard button: ${JSON.stringify(unhandledButton)}`);
        }
      }
    });
  });
}
