/**
 * A two-letter ISO 639-1 language code that one of a bot's per-language settings, such as a
 * command list or description, is for, or the empty string for users whose language has no
 * dedicated setting.
 */
export type BotLanguageCode = string;

/** Empty, or two lowercase Latin letters. */
const BOT_LANGUAGE_CODE_PATTERN = /^(?:[a-z]{2})?$/;

/**
 * Whether Telegram accepts a language code for a bot's per-language settings, as TDLib's
 * `validate_bot_language_code` checks it.
 */
export function isBotLanguageCode(languageCode: string): languageCode is BotLanguageCode {
  return BOT_LANGUAGE_CODE_PATTERN.test(languageCode);
}
