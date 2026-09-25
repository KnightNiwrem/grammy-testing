import { z } from 'zod';

import type { ButtonAppearance } from '../../../types/button_appearance.ts';
import {
  type InlineKeyboard,
  type InlineKeyboardButton,
  MAX_COPIED_TEXT_LENGTH,
} from '../../../types/inline_keyboard.ts';
import type { RichMessageButtonAction } from '../../../types/rich_message.ts';
import type {
  BotMessageReplyMarkup,
  ReplyInterfaceMarkup,
  ReplyKeyboardButton,
} from '../../../types/reply_interface.ts';
import { jsonParameter, optionalInt64Identifier } from './request_parameters.ts';

/** Telegram's documented limit on an input field placeholder. */
const MAX_INPUT_FIELD_PLACEHOLDER_LENGTH = 64;

/**
 * A button's appearance, read as the official Bot API server's `get_button_style` reads its
 * `style`: the name in any ASCII letter case, where an empty name or `default` chooses the
 * client's default. Telegram also reads the icon's identifier from a JSON number, which cannot
 * hold every 64-bit identifier exactly, so the emulator requires the documented string.
 */
const buttonAppearanceShape = {
  style: z.string()
    .transform((style) => style.replace(/[A-Z]/g, (letter) => letter.toLowerCase()))
    .pipe(z.enum(['', 'default', 'primary', 'danger', 'success']))
    .transform((style) => style === '' || style === 'default' ? undefined : style)
    .optional(),
  icon_custom_emoji_id: optionalInt64Identifier().optional(),
};

function readButtonAppearance(
  { style, icon_custom_emoji_id }: {
    readonly style?: ButtonAppearance['style'];
    readonly icon_custom_emoji_id?: string;
  },
): ButtonAppearance {
  return {
    ...(style === undefined ? {} : { style }),
    ...(icon_custom_emoji_id === undefined ? {} : { iconCustomEmojiId: icon_custom_emoji_id }),
  };
}

/**
 * The fields of a button's action, which must be exactly one supported action: a callback, a URL,
 * copying text, switching to inline mode, or none. Telegram also accepts other actions, and
 * buttons with several, using the first action it recognizes; rejecting them instead surfaces
 * unsupported or ambiguous markup in tests.
 */
const buttonActionSchema = z.union([
  z.strictObject({ callback_data: z.string().min(1) })
    .transform(({ callback_data }): RichMessageButtonAction => ({
      kind: 'callback',
      callbackData: callback_data,
    })),
  // Sending reads the link as Telegram does; an empty link would leave a text button, which
  // Telegram refuses in an inline keyboard.
  z.strictObject({ url: z.string().min(1) })
    .transform(({ url }): RichMessageButtonAction => ({ kind: 'url', url })),
  // TDLib accepts any copied text; the emulator enforces the Bot API's documented length.
  z.strictObject({
    copy_text: z.strictObject({ text: z.string().min(1).max(MAX_COPIED_TEXT_LENGTH) }),
  }).transform(({ copy_text }): RichMessageButtonAction => ({
    kind: 'copy_text',
    copiedText: copy_text.text,
  })),
  // `switch_inline_query` lets the user choose any chat, as the official Bot API server's
  // `get_inline_keyboard_button_type` reads it.
  z.strictObject({ switch_inline_query: z.string() })
    .transform(({ switch_inline_query }): RichMessageButtonAction => ({
      kind: 'switch_inline_query',
      query: switch_inline_query,
      target: {
        kind: 'chosen_chat',
        chatTypes: {
          allowsUserChats: true,
          allowsBotChats: true,
          allowsGroupChats: true,
          allowsChannelChats: true,
        },
      },
    })),
  // `switch_inline_query_chosen_chat` limits the chats the user may choose; an omitted kind is
  // not allowed. Sending checks that it allows at least one, as TDLib does.
  z.strictObject({
    switch_inline_query_chosen_chat: z.strictObject({
      query: z.string().default(''),
      allow_user_chats: z.boolean().default(false),
      allow_bot_chats: z.boolean().default(false),
      allow_group_chats: z.boolean().default(false),
      allow_channel_chats: z.boolean().default(false),
    }),
  }).transform(({ switch_inline_query_chosen_chat: chosenChat }): RichMessageButtonAction => ({
    kind: 'switch_inline_query',
    query: chosenChat.query,
    target: {
      kind: 'chosen_chat',
      chatTypes: {
        allowsUserChats: chosenChat.allow_user_chats,
        allowsBotChats: chosenChat.allow_bot_chats,
        allowsGroupChats: chosenChat.allow_group_chats,
        allowsChannelChats: chosenChat.allow_channel_chats,
      },
    },
  })),
  z.strictObject({ switch_inline_query_current_chat: z.string() })
    .transform(({ switch_inline_query_current_chat }): RichMessageButtonAction => ({
      kind: 'switch_inline_query',
      query: switch_inline_query_current_chat,
      target: { kind: 'current_chat' },
    })),
  // Telegram reads any `disabled` value; the emulator requires the documented empty object.
  z.strictObject({ disabled: z.strictObject({}) })
    .transform((): RichMessageButtonAction => ({ kind: 'disabled' })),
]);

/**
 * A button of an inline keyboard or of a rich message: the fields `faceShape` describes, which show
 * the button, and the fields of its action, as `buttonActionSchema` reads them. Parses as the
 * face's fields and the action.
 */
export function buttonSchema<FaceShape extends z.ZodRawShape>(faceShape: FaceShape) {
  const faceSchema = z.strictObject(faceShape);
  return z.record(z.string(), z.unknown()).transform((fields, context) => {
    const faceFields: Record<string, unknown> = {};
    const actionFields: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) {
      (Object.hasOwn(faceShape, name) ? faceFields : actionFields)[name] = value;
    }
    const face = faceSchema.safeParse(faceFields);
    const action = buttonActionSchema.safeParse(actionFields);
    if (!face.success || !action.success) {
      context.issues.push({
        code: 'custom',
        message: 'Expected the fields of a button and of one supported action',
        input: fields,
      });
      return z.NEVER;
    }
    return { face: face.data, action: action.data };
  });
}

const inlineKeyboardButtonSchema = buttonSchema({
  text: z.string().min(1),
  ...buttonAppearanceShape,
}).transform(({ face, action }): InlineKeyboardButton => ({
  ...action,
  text: face.text,
  ...readButtonAppearance(face),
}));

/**
 * An `InlineKeyboardMarkup` object, as `inlineKeyboardMarkupParameter` describes it, for objects
 * that hold one, such as inline query results.
 */
export const inlineKeyboardMarkupSchema = z.strictObject({
  inline_keyboard: z.array(z.array(inlineKeyboardButtonSchema).min(1)),
}).transform(({ inline_keyboard }): InlineKeyboard | undefined =>
  inline_keyboard.length === 0 ? undefined : inline_keyboard
);

const replyKeyboardButtonSchema = z.union([
  z.string().min(1),
  z.strictObject({ text: z.string().min(1), ...buttonAppearanceShape }),
]).transform((button): ReplyKeyboardButton =>
  typeof button === 'string'
    ? { text: button }
    : { text: button.text, ...readButtonAppearance(button) }
);

const inputFieldPlaceholderSchema = z.string().min(1).max(MAX_INPUT_FIELD_PLACEHOLDER_LENGTH);

// `selective` shows the markup only to mentioned users and the replied message's sender; as on
// Telegram, it has no effect in private chats.
const selectiveSchema = z.boolean().default(false);

const replyKeyboardMarkupSchema = z.strictObject({
  keyboard: z.array(z.array(replyKeyboardButtonSchema).min(1)),
  is_persistent: z.boolean().default(false),
  resize_keyboard: z.boolean().default(false),
  one_time_keyboard: z.boolean().default(false),
  input_field_placeholder: inputFieldPlaceholderSchema.optional(),
  selective: selectiveSchema,
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
    isSelective: markup.selective,
  }
);

const replyKeyboardRemovalSchema = z.strictObject({
  remove_keyboard: z.literal(true),
  selective: selectiveSchema,
}).transform(({ selective }): ReplyInterfaceMarkup => ({
  kind: 'reply_keyboard_removal',
  isSelective: selective,
}));

const forcedReplySchema = z.strictObject({
  force_reply: z.literal(true),
  input_field_placeholder: inputFieldPlaceholderSchema.optional(),
  selective: selectiveSchema,
}).transform(({ input_field_placeholder, selective }): ReplyInterfaceMarkup => ({
  kind: 'forced_reply',
  ...(input_field_placeholder === undefined
    ? {}
    : { inputFieldPlaceholder: input_field_placeholder }),
  isSelective: selective,
}));

/**
 * A `reply_markup` parameter holding an inline keyboard of callback, URL, copy-text,
 * switch-inline and disabled buttons, for methods that edit a message.
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
