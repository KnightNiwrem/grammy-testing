import { parseHtmlMarkup } from './html_markup.ts';
import { parseMarkdownMarkup, parseMarkdownV2Markup } from './markdown_markup.ts';
import type { MarkupParsing } from './markup_input.ts';

/** The Bot API parse modes, by the lowercase names Telegram matches case-insensitively. */
const PARSE_MODES = ['markdown', 'markdownv2', 'html'] as const;

export type ParseMode = typeof PARSE_MODES[number];

export function isParseMode(name: string): name is ParseMode {
  return (PARSE_MODES as readonly string[]).includes(name);
}

/** Reads text written in one of Telegram's markup languages into plain text and entities. */
export function parseMarkup(text: string, parseMode: ParseMode): MarkupParsing {
  switch (parseMode) {
    case 'markdown':
      return parseMarkdownMarkup(text);
    case 'markdownv2':
      return parseMarkdownV2Markup(text);
    case 'html':
      return parseHtmlMarkup(text);
    default: {
      const unhandledParseMode: never = parseMode;
      throw new Error(`Unhandled parse mode: ${unhandledParseMode}`);
    }
  }
}
