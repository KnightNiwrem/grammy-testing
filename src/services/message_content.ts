import {
  fixFormattedText,
  type FormattedText,
  type FormattedTextFixingContext,
} from '../text_entities/formatted_text.ts';
import { areTextEntitiesEqual } from '../text_entities/text_entity_equality.ts';
import { type InlineKeyboard, MAX_CALLBACK_DATA_BYTES } from '../types/inline_keyboard.ts';
import { MAX_TEXT_MESSAGE_LENGTH, type TextEntity } from '../types/virtual_message.ts';

// Telegram's rules for the content of text messages, which apply alike in every chat type.

/**
 * Telegram rejected the text or its entities while normalizing them, for example because only
 * whitespace remains or an entity ends past the text. `textError` is TDLib's own description.
 */
export interface TextInvalidFailure {
  readonly reason: 'text_invalid';
  readonly textError: string;
}

export type MessageTextNormalization =
  | { readonly normalized: true; readonly formattedText: FormattedText }
  | {
    readonly normalized: false;
    readonly failure: TextInvalidFailure | { readonly reason: 'message_text_too_long' };
  };

/**
 * Normalizes message text and the entities its sender specified as Telegram does, which also marks
 * bot commands, then checks that the normalized text fits in a message.
 */
export function normalizeMessageText(
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

/** The content of a message that a bot's edit replaces. */
interface EditableMessageContent extends FormattedText {
  readonly inlineKeyboard?: InlineKeyboard;
}

/**
 * Checks a bot's edit of its message as Telegram does: the new keyboard's callback data must fit,
 * and the edit must change the text, its entities, or the keyboard.
 */
export function checkBotMessageEdit(
  message: EditableMessageContent,
  edit: EditableMessageContent,
): 'callback_data_invalid' | 'message_not_modified' | undefined {
  if (edit.inlineKeyboard !== undefined && !hasOnlyValidCallbackData(edit.inlineKeyboard)) {
    return 'callback_data_invalid';
  }
  return isSameFormattedText(edit, message) &&
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

/** Whether an edit leaves the text and its entities as they are, which Telegram refuses. */
export function isSameFormattedText(first: FormattedText, second: FormattedText): boolean {
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
