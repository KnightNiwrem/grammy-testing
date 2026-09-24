import { z } from 'zod';

import type { InlineKeyboard, InlineKeyboardButton } from '../../../types/inline_keyboard.ts';
import type {
  BotMessageReplyMarkup,
  ReplyInterfaceMarkup,
  ReplyKeyboardButton,
} from '../../../types/reply_interface.ts';
import { jsonParameter } from './request_parameters.ts';

/** Telegram's documented limit on an input field placeholder. */
const MAX_INPUT_FIELD_PLACEHOLDER_LENGTH = 64;

const callbackButtonSchema = z.strictObject({
  text: z.string().min(1),
  callback_data: z.string().min(1),
}).transform(({ text, callback_data }): InlineKeyboardButton => ({
  kind: 'callback',
  text,
  callbackData: callback_data,
}));

const urlButtonSchema = z.strictObject({
  text: z.string().min(1),
  url: z.string().refine((url) => URL.canParse(url)),
}).transform(({ text, url }): InlineKeyboardButton => ({ kind: 'url', text, url }));

const inlineKeyboardMarkupSchema = z.strictObject({
  inline_keyboard: z.array(z.array(z.union([callbackButtonSchema, urlButtonSchema])).min(1)),
}).transform(({ inline_keyboard }): InlineKeyboard | undefined =>
  inline_keyboard.length === 0 ? undefined : inline_keyboard
);

const replyKeyboardButtonSchema = z.union([
  z.string().min(1),
  z.strictObject({ text: z.string().min(1) }),
]).transform((button): ReplyKeyboardButton => ({
  text: typeof button === 'string' ? button : button.text,
}));

const inputFieldPlaceholderSchema = z.string().min(1).max(MAX_INPUT_FIELD_PLACEHOLDER_LENGTH);

// `selective` shows the markup only to mentioned users and the replied message's sender; as on
// Telegram, it has no effect in private chats.
const replyKeyboardMarkupSchema = z.strictObject({
  keyboard: z.array(z.array(replyKeyboardButtonSchema).min(1)),
  is_persistent: z.boolean().default(false),
  resize_keyboard: z.boolean().default(false),
  one_time_keyboard: z.boolean().default(false),
  input_field_placeholder: inputFieldPlaceholderSchema.optional(),
  selective: z.boolean().optional(),
}).transform((markup): ReplyInterfaceMarkup | undefined =>
  markup.keyboard.length === 0 ? undefined : {
    kind: 'reply_keyboard',
    rows: markup.keyboard,
    isPersistent: markup.is_persistent,
    resizesToFit: markup.resize_keyboard,
    isOneTime: markup.one_time_keyboard,
    ...(markup.input_field_placeholder === undefined
      ? {}
      : { inputFieldPlaceholder: markup.input_field_placeholder }),
  }
);

const replyKeyboardRemovalSchema = z.strictObject({
  remove_keyboard: z.literal(true),
  selective: z.boolean().optional(),
}).transform((): ReplyInterfaceMarkup => ({ kind: 'reply_keyboard_removal' }));

const forcedReplySchema = z.strictObject({
  force_reply: z.literal(true),
  input_field_placeholder: inputFieldPlaceholderSchema.optional(),
  selective: z.boolean().optional(),
}).transform(({ input_field_placeholder }): ReplyInterfaceMarkup => ({
  kind: 'forced_reply',
  ...(input_field_placeholder === undefined
    ? {}
    : { inputFieldPlaceholder: input_field_placeholder }),
}));

/**
 * A `reply_markup` parameter holding an inline keyboard of callback and URL buttons, for methods
 * that edit a message.
 *
 * As on Telegram, a keyboard without rows attaches no keyboard, so it parses as `undefined`.
 * Telegram also accepts other button types and buttons with several actions, using the first
 * action it recognizes; rejecting them instead surfaces unsupported or ambiguous markup in tests.
 * Telegram rejects callback data longer than 64 bytes only when sending, so that limit is checked
 * there.
 */
export function inlineKeyboardMarkupParameter() {
  return jsonParameter(inlineKeyboardMarkupSchema);
}

/**
 * A `reply_markup` parameter of a method that sends a message: an inline keyboard, as
 * `inlineKeyboardMarkupParameter` reads it, or a reply keyboard, its removal, or a forced reply.
 *
 * As on Telegram, a keyboard without rows attaches no markup. Reply keyboard buttons that request
 * a contact, location, poll, users, chat, or web app are not supported, and neither is markup
 * that combines kinds, which Telegram resolves by precedence; both are rejected.
 */
export function messageReplyMarkupParameter() {
  return jsonParameter(
    z.union([
      inlineKeyboardMarkupSchema.transform((inlineKeyboard): BotMessageReplyMarkup =>
        inlineKeyboard === undefined ? {} : { inlineKeyboard }
      ),
      z.union([replyKeyboardMarkupSchema, replyKeyboardRemovalSchema, forcedReplySchema])
        .transform((replyInterfaceMarkup): BotMessageReplyMarkup =>
          replyInterfaceMarkup === undefined ? {} : { replyInterfaceMarkup }
        ),
    ]),
  );
}
