import { z } from 'zod';

import type { InlineKeyboard, InlineKeyboardButton } from '../../../types/inline_keyboard.ts';
import { jsonParameter } from './request_parameters.ts';

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

/**
 * A `reply_markup` parameter holding an inline keyboard of callback and URL buttons.
 *
 * As on Telegram, a keyboard without rows attaches no keyboard, so it parses as `undefined`.
 * Telegram also accepts reply keyboards, other button types, and buttons with several actions,
 * using the first action it recognizes; rejecting them instead surfaces unsupported or ambiguous
 * markup in tests. Telegram rejects callback data longer than 64 bytes only when sending, so
 * that limit is checked there.
 */
export function inlineKeyboardMarkupParameter() {
  return jsonParameter(
    z.strictObject({
      inline_keyboard: z.array(z.array(z.union([callbackButtonSchema, urlButtonSchema])).min(1)),
    }),
  ).transform(({ inline_keyboard }): InlineKeyboard | undefined =>
    inline_keyboard.length === 0 ? undefined : inline_keyboard
  );
}
