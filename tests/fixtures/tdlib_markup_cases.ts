// Cases from `check_parse_html` and `check_parse_markdown` (MarkdownV2) in TDLib's
// `test/message_entities.cpp` at commit ea97bcdd3a15523c58ddfe772b4547187cf5bbeb, with entity types
// written as the Bot API names them. A case that expects a date and time entity expects the
// emulator to report such entities as unsupported instead.

import type { TextEntity } from '../../src/types/virtual_message.ts';

export type TdlibMarkupCase =
  | { readonly markup: string; readonly text: string; readonly entities: readonly TextEntity[] }
  | { readonly markup: string; readonly error: string }
  | { readonly markup: string; readonly dateTimeUnsupported: true };

export const TDLIB_HTML_CASES: readonly TdlibMarkupCase[] = [
  {
    markup: '&#57311;',
    error:
      'Text contains invalid Unicode characters after decoding HTML entities, check for unmatched surrogate code units',
  },
  {
    markup: '&#xDFDF;',
    error:
      'Text contains invalid Unicode characters after decoding HTML entities, check for unmatched surrogate code units',
  },
  {
    markup: '&#xDFDF',
    error:
      'Text contains invalid Unicode characters after decoding HTML entities, check for unmatched surrogate code units',
  },
  { markup: '🏟 🏟&lt;<abacaba', error: 'Unclosed start tag at byte offset 13' },
  { markup: '🏟 🏟&lt;<abac aba>', error: 'Unsupported start tag "abac" at byte offset 13' },
  { markup: '🏟 🏟&lt;<abac>', error: 'Unsupported start tag "abac" at byte offset 13' },
  { markup: '🏟 🏟&lt;<i   =aba>', error: 'Empty attribute name in the tag "i" at byte offset 13' },
  { markup: '🏟 🏟&lt;<i    aba>', error: 'Can\'t find end tag corresponding to start tag "i"' },
  { markup: '🏟 🏟&lt;<i    aba  =  ', error: 'Unclosed start tag "i" at byte offset 13' },
  {
    markup: '🏟 🏟&lt;<i    aba  =  190azAz-.,',
    error: 'Unexpected end of name token at byte offset 27',
  },
  {
    markup: '🏟 🏟&lt;<i    aba  =  "&lt;&gt;&quot;>',
    error: 'Unclosed start tag at byte offset 13',
  },
  {
    markup: "🏟 🏟&lt;<i    aba  =  '&lt;&gt;&quot;>",
    error: 'Unclosed start tag at byte offset 13',
  },
  { markup: '🏟 🏟&lt;</', error: 'Unexpected end tag at byte offset 13' },
  { markup: '🏟 🏟&lt;<b></b></', error: 'Unexpected end tag at byte offset 20' },
  { markup: '🏟 🏟&lt;<i>a</i   ', error: 'Unclosed end tag at byte offset 17' },
  {
    markup: '🏟 🏟&lt;<i>a</em   >',
    error: 'Unmatched end tag at byte offset 17, expected "</i>", found "</em>"',
  },
  { markup: '', text: '', entities: [] },
  { markup: '➡️ ➡️', text: '➡️ ➡️', entities: [] },
  {
    markup: '&ge;&lt;&gt;&amp;&quot;&laquo;&raquo;&#12345678;',
    text: '&ge;<>&"&laquo;&raquo;&#12345678;',
    entities: [],
  },
  { markup: '&Or;', text: '&Or;', entities: [] },
  {
    markup: '➡️ ➡️<i>➡️ ➡️</i>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'italic', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<em>➡️ ➡️</em>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'italic', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<b>➡️ ➡️</b>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'bold', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<strong>➡️ ➡️</strong>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'bold', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<u>➡️ ➡️</u>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'underline', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<ins>➡️ ➡️</ins>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'underline', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<s>➡️ ➡️</s>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'strikethrough', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<strike>➡️ ➡️</strike>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'strikethrough', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<del>➡️ ➡️</del>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'strikethrough', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<blockquote>➡️ ➡️</blockquote>',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'blockquote', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️<i>➡️ ➡️</i><b>➡️ ➡️</b>',
    text: '➡️ ➡️➡️ ➡️➡️ ➡️',
    entities: [{ type: 'italic', offset: 5, length: 5 }, { type: 'bold', offset: 10, length: 5 }],
  },
  {
    markup: '🏟 🏟<i>🏟 &lt🏟</i>',
    text: '🏟 🏟🏟 <🏟',
    entities: [{ type: 'italic', offset: 5, length: 6 }],
  },
  {
    markup: '🏟 🏟<i>🏟 &gt;<b aba   =   caba>&lt🏟</b></i>',
    text: '🏟 🏟🏟 ><🏟',
    entities: [{ type: 'italic', offset: 5, length: 7 }, { type: 'bold', offset: 9, length: 3 }],
  },
  {
    markup: '🏟 🏟&lt;<i    aba  =  190azAz-.   >a</i>',
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: '🏟 🏟&lt;<i    aba  =  190azAz-.>a</i>',
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: '🏟 🏟&lt;<i    aba  =  "&lt;&gt;&quot;">a</i>',
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: "🏟 🏟&lt;<i    aba  =  '&lt;&gt;&quot;'>a</i>",
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: "🏟 🏟&lt;<i    aba  =  '&lt;&gt;&quot;'>a</>",
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: '🏟 🏟&lt;<i>🏟 🏟&lt;</>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'italic', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<i>a</    >',
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  {
    markup: '🏟 🏟&lt;<i>a</i   >',
    text: '🏟 🏟<a',
    entities: [{ type: 'italic', offset: 6, length: 1 }],
  },
  { markup: '🏟 🏟&lt;<b></b>', text: '🏟 🏟<', entities: [] },
  { markup: '<i>\t</i>', text: '\t', entities: [{ type: 'italic', offset: 0, length: 1 }] },
  { markup: '<i>\r</i>', text: '\r', entities: [{ type: 'italic', offset: 0, length: 1 }] },
  { markup: '<i>\n</i>', text: '\n', entities: [{ type: 'italic', offset: 0, length: 1 }] },
  {
    markup: '➡️ ➡️<span class = "tg-spoiler">➡️ ➡️</span><b>➡️ ➡️</b>',
    text: '➡️ ➡️➡️ ➡️➡️ ➡️',
    entities: [{ type: 'spoiler', offset: 5, length: 5 }, { type: 'bold', offset: 10, length: 5 }],
  },
  {
    markup: '🏟 🏟<span class="tg-spoiler">🏟 &lt🏟</span>',
    text: '🏟 🏟🏟 <🏟',
    entities: [{ type: 'spoiler', offset: 5, length: 6 }],
  },
  {
    markup: '🏟 🏟<span class="tg-spoiler">🏟 &gt;<b aba   =   caba>&lt🏟</b></span>',
    text: '🏟 🏟🏟 ><🏟',
    entities: [{ type: 'spoiler', offset: 5, length: 7 }, { type: 'bold', offset: 9, length: 3 }],
  },
  {
    markup: '➡️ ➡️<tg-spoiler>➡️ ➡️</tg-spoiler><b>➡️ ➡️</b>',
    text: '➡️ ➡️➡️ ➡️➡️ ➡️',
    entities: [{ type: 'spoiler', offset: 5, length: 5 }, { type: 'bold', offset: 10, length: 5 }],
  },
  {
    markup: '🏟 🏟<tg-spoiler>🏟 &lt🏟</tg-spoiler>',
    text: '🏟 🏟🏟 <🏟',
    entities: [{ type: 'spoiler', offset: 5, length: 6 }],
  },
  {
    markup: '🏟 🏟<tg-spoiler>🏟 &gt;<b aba   =   caba>&lt🏟</b></tg-spoiler>',
    text: '🏟 🏟🏟 ><🏟',
    entities: [{ type: 'spoiler', offset: 5, length: 7 }, { type: 'bold', offset: 9, length: 3 }],
  },
  {
    markup: '<a href=telegram.org>\t</a>',
    text: '\t',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: '<a href=telegram.org>\r</a>',
    text: '\r',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: '<a href=telegram.org>\n</a>',
    text: '\n',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: '<code><i><b> </b></i></code><i><b><code> </code></b></i>',
    text: '  ',
    entities: [
      { type: 'code', offset: 0, length: 1 },
      { type: 'bold', offset: 0, length: 1 },
      { type: 'italic', offset: 0, length: 1 },
      { type: 'code', offset: 1, length: 1 },
      { type: 'bold', offset: 1, length: 1 },
      { type: 'italic', offset: 1, length: 1 },
    ],
  },
  {
    markup: '<i><b> </b> <code> </code></i>',
    text: '   ',
    entities: [{ type: 'italic', offset: 0, length: 3 }, { type: 'bold', offset: 0, length: 1 }, {
      type: 'code',
      offset: 2,
      length: 1,
    }],
  },
  {
    markup: '<a href=telegram.org> </a>',
    text: ' ',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: '<a href  ="telegram.org"   > </a>',
    text: ' ',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: "<a   href=  'telegram.org'   > </a>",
    text: ' ',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  {
    markup: "<a   href=  'telegram.org?&lt;'   > </a>",
    text: ' ',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/?<' }],
  },
  { markup: '<a> </a>', text: ' ', entities: [] },
  { markup: '<a>telegram.org </a>', text: 'telegram.org ', entities: [] },
  {
    markup: '<a>telegram.org</a>',
    text: 'telegram.org',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'http://telegram.org/' }],
  },
  {
    markup: '<a>https://telegram.org/asdsa?asdasdwe#12e3we</a>',
    text: 'https://telegram.org/asdsa?asdasdwe#12e3we',
    entities: [{
      type: 'text_link',
      offset: 0,
      length: 42,
      url: 'https://telegram.org/asdsa?asdasdwe#12e3we',
    }],
  },
  {
    markup: '🏟 🏟&lt;<pre  >🏟 🏟&lt;</>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<code >🏟 🏟&lt;</>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'code', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<pre><code>🏟 🏟&lt;</code></>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 6 }, { type: 'code', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<pre><code class="language-">🏟 🏟&lt;</code></>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 6 }, { type: 'code', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<pre><code class="language-fift">🏟 🏟&lt;</></>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 6, language: 'fift' }],
  },
  {
    markup: '🏟 🏟&lt;<code class="language-fift"><pre>🏟 🏟&lt;</></>',
    text: '🏟 🏟<🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 6, language: 'fift' }],
  },
  {
    markup: '🏟 🏟&lt;<pre><code class="language-fift">🏟 🏟&lt;</> </>',
    text: '🏟 🏟<🏟 🏟< ',
    entities: [{ type: 'pre', offset: 6, length: 7 }, { type: 'code', offset: 6, length: 6 }],
  },
  {
    markup: '🏟 🏟&lt;<pre> <code class="language-fift">🏟 🏟&lt;</></>',
    text: '🏟 🏟< 🏟 🏟<',
    entities: [{ type: 'pre', offset: 6, length: 7 }, { type: 'code', offset: 7, length: 6 }],
  },
  {
    markup: '➡️ ➡️<tg-emoji emoji-id = "12345">➡️ ➡️</tg-emoji><b>➡️ ➡️</b>',
    text: '➡️ ➡️➡️ ➡️➡️ ➡️',
    entities: [{ type: 'custom_emoji', offset: 5, length: 5, customEmojiId: '12345' }, {
      type: 'bold',
      offset: 10,
      length: 5,
    }],
  },
  {
    markup: '🏟 🏟<tg-emoji emoji-id="54321">🏟 &lt🏟</tg-emoji>',
    text: '🏟 🏟🏟 <🏟',
    entities: [{ type: 'custom_emoji', offset: 5, length: 6, customEmojiId: '54321' }],
  },
  {
    markup: '🏟 🏟<b aba   =   caba><tg-emoji emoji-id="1">🏟</tg-emoji>1</b>',
    text: '🏟 🏟🏟1',
    entities: [{ type: 'bold', offset: 5, length: 3 }, {
      type: 'custom_emoji',
      offset: 5,
      length: 2,
      customEmojiId: '1',
    }],
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "r">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "t">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "T">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "d">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "D">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "w">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "W">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "tttTTdDwW">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    dateTimeUnsupported: true,
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "rt">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    error: 'Invalid date format used',
  },
  {
    markup: '➡️ ➡️<tg-time unix = "12345", format = "ts">➡️ ➡️</tg-time><b>➡️ ➡️</b>',
    error: 'Invalid date format used',
  },
  {
    markup: '<blockquote   cite="" askdlbas nasjdbaj nj12b3>a&lt;<pre  >b;</></>',
    text: 'a<b;',
    entities: [{ type: 'blockquote', offset: 0, length: 4 }, { type: 'pre', offset: 2, length: 2 }],
  },
  {
    markup: '<blockquote   expandable>a&lt;<pre  >b;</></>',
    text: 'a<b;',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 4 }, {
      type: 'pre',
      offset: 2,
      length: 2,
    }],
  },
  {
    markup: '<blockquote   expandable   asd>a&lt;<pre  >b;</></>',
    text: 'a<b;',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 4 }, {
      type: 'pre',
      offset: 2,
      length: 2,
    }],
  },
  {
    markup: '<blockquote   expandable=false>a&lt;<pre  >b;</></>',
    text: 'a<b;',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 4 }, {
      type: 'pre',
      offset: 2,
      length: 2,
    }],
  },
];

export const TDLIB_MARKDOWN_V2_CASES: readonly TdlibMarkupCase[] = [
  { markup: '🏟 🏟_abacaba', error: "Can't find end of Italic entity at byte offset 9" },
  { markup: '🏟 🏟_abac * asd ', error: "Can't find end of Bold entity at byte offset 15" },
  { markup: '🏟 🏟_abac * asd _', error: "Can't find end of Italic entity at byte offset 21" },
  { markup: '🏟 🏟`', error: "Can't find end of Code entity at byte offset 9" },
  { markup: '🏟 🏟```', error: "Can't find end of Pre entity at byte offset 9" },
  { markup: '🏟 🏟```a', error: "Can't find end of Pre entity at byte offset 9" },
  { markup: '🏟 🏟```a ', error: "Can't find end of PreCode entity at byte offset 9" },
  { markup: '🏟 🏟__🏟 🏟_', error: "Can't find end of Italic entity at byte offset 20" },
  { markup: '🏟 🏟_🏟 🏟__', error: "Can't find end of Underline entity at byte offset 19" },
  { markup: '🏟 🏟```🏟 🏟`', error: "Can't find end of Code entity at byte offset 21" },
  { markup: '🏟 🏟```🏟 🏟_', error: "Can't find end of PreCode entity at byte offset 9" },
  { markup: '🏟 🏟```🏟 🏟\\`', error: "Can't find end of PreCode entity at byte offset 9" },
  { markup: '[telegram\\.org](asd\\)', error: "Can't find end of a URL at byte offset 16" },
  { markup: '[telegram\\.org](', error: "Can't find end of a URL at byte offset 16" },
  { markup: '[telegram\\.org](asd', error: "Can't find end of a URL at byte offset 16" },
  { markup: '🏟 🏟__🏟 _🏟___', error: "Can't find end of Italic entity at byte offset 23" },
  { markup: '🏟 🏟__', error: "Can't find end of Underline entity at byte offset 9" },
  { markup: '🏟 🏟||test\\|', error: "Can't find end of Spoiler entity at byte offset 9" },
  {
    markup: '🏟 🏟!',
    error: "Character '!' is reserved and must be escaped with the preceding '\\'",
  },
  {
    markup: '🏟 🏟>',
    error: "Character '>' is reserved and must be escaped with the preceding '\\'",
  },
  { markup: '🏟 🏟![', error: "Can't find end of CustomEmoji entity at byte offset 9" },
  { markup: '🏟 🏟![👍', error: "Can't find end of CustomEmoji entity at byte offset 9" },
  { markup: '🏟 🏟![👍]', error: 'The entity must contain a tg://emoji or tg://time URL' },
  { markup: '🏟 🏟![👍](tg://emoji?id=1234', error: "Can't find end of a URL at byte offset 17" },
  { markup: '🏟 🏟![👍](t://emoji?id=1234)', error: 'Invalid tg://emoji or tg://time URL specified' },
  { markup: '🏟 🏟![👍](tg:emojis?id=1234)', error: 'Invalid tg://emoji or tg://time URL specified' },
  { markup: '🏟 🏟![👍](tg://emoji#test)', error: 'Invalid tg://emoji or tg://time URL specified' },
  {
    markup: '🏟 🏟![👍](tg://emoji?test=1#&id=25)',
    error: 'Invalid tg://emoji or tg://time URL specified',
  },
  {
    markup: '🏟 🏟![👍](tg://emoji?test=1231&id=025)',
    error: 'Invalid tg://emoji or tg://time URL specified',
  },
  { markup: '🏟 🏟![👍](tg://time?id=1234', error: "Can't find end of a URL at byte offset 17" },
  { markup: '🏟 🏟![👍](t://time?id=1234)', error: 'Invalid tg://emoji or tg://time URL specified' },
  { markup: '🏟 🏟![👍](tg:times?id=1234)', error: 'Invalid tg://emoji or tg://time URL specified' },
  { markup: '🏟 🏟![👍](tg://time#test)', error: 'Invalid tg://emoji or tg://time URL specified' },
  {
    markup: '🏟 🏟![👍](tg://time?test=1#&date=25)',
    error: 'Invalid tg://emoji or tg://time URL specified',
  },
  {
    markup: '🏟 🏟![👍](tg://time?test=1231&date=025)',
    error: 'Invalid tg://emoji or tg://time URL specified',
  },
  {
    markup: '>*b\n>ld \n>bo\nld*\nasd\ndef',
    error: "Can't find end of Bold entity at byte offset 1",
  },
  {
    markup: '>\n*a*>2',
    error: "Character '>' is reserved and must be escaped with the preceding '\\'",
  },
  {
    markup: '>asd\n>q||e||w||\n||asdad',
    error: "Can't find end of Spoiler entity at byte offset 16",
  },
  { markup: '>asd\n>q||ew\n||asdad', error: "Can't find end of Spoiler entity at byte offset 7" },
  {
    markup: '>asd\n>q||e||w__\n||asdad',
    error: "Can't find end of Underline entity at byte offset 13",
  },
  {
    markup: '>asd\n>q||e||w||a\n||asdad',
    error: "Can't find end of Spoiler entity at byte offset 13",
  },
  { markup: '', text: '', entities: [] },
  { markup: '\\\\', text: '\\', entities: [] },
  { markup: '\\\\\\', text: '\\\\', entities: [] },
  { markup: '\\\\\\\\\\_\\*\\`', text: '\\\\_*`', entities: [] },
  { markup: '➡️ ➡️', text: '➡️ ➡️', entities: [] },
  { markup: '🏟 🏟``', text: '🏟 🏟', entities: [] },
  {
    markup: '🏟 🏟_abac \\* asd _',
    text: '🏟 🏟abac * asd ',
    entities: [{ type: 'italic', offset: 5, length: 11 }],
  },
  {
    markup: '🏟 \\.🏟_🏟\\. 🏟_',
    text: '🏟 .🏟🏟. 🏟',
    entities: [{ type: 'italic', offset: 6, length: 6 }],
  },
  { markup: '\\\\\\a\\b\\c\\d\\e\\f\\1\\2\\3\\4\\➡️\\', text: '\\abcdef1234\\➡️\\', entities: [] },
  {
    markup: '➡️ ➡️_➡️ ➡️_',
    text: '➡️ ➡️➡️ ➡️',
    entities: [{ type: 'italic', offset: 5, length: 5 }],
  },
  {
    markup: '➡️ ➡️_➡️ ➡️_*➡️ ➡️*',
    text: '➡️ ➡️➡️ ➡️➡️ ➡️',
    entities: [{ type: 'italic', offset: 5, length: 5 }, { type: 'bold', offset: 10, length: 5 }],
  },
  { markup: '🏟 🏟_🏟 \\.🏟_', text: '🏟 🏟🏟 .🏟', entities: [{ type: 'italic', offset: 5, length: 6 }] },
  {
    markup: '🏟 🏟_🏟 *🏟*_',
    text: '🏟 🏟🏟 🏟',
    entities: [{ type: 'italic', offset: 5, length: 5 }, { type: 'bold', offset: 8, length: 2 }],
  },
  {
    markup: '🏟 🏟_🏟 __🏟___',
    text: '🏟 🏟🏟 🏟',
    entities: [{ type: 'italic', offset: 5, length: 5 }, {
      type: 'underline',
      offset: 8,
      length: 2,
    }],
  },
  {
    markup: '🏟 🏟__🏟 _🏟_ __',
    text: '🏟 🏟🏟 🏟 ',
    entities: [{ type: 'underline', offset: 5, length: 6 }, {
      type: 'italic',
      offset: 8,
      length: 2,
    }],
  },
  {
    markup: '🏟 🏟__🏟 _🏟_\\___',
    text: '🏟 🏟🏟 🏟_',
    entities: [{ type: 'underline', offset: 5, length: 6 }, {
      type: 'italic',
      offset: 8,
      length: 2,
    }],
  },
  { markup: '🏟 🏟`🏟 🏟```', text: '🏟 🏟🏟 🏟', entities: [{ type: 'code', offset: 5, length: 5 }] },
  {
    markup: '🏟 🏟```🏟 🏟```',
    text: '🏟 🏟 🏟',
    entities: [{ type: 'pre', offset: 5, length: 3, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\n🏟```',
    text: '🏟 🏟🏟',
    entities: [{ type: 'pre', offset: 5, length: 2, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\r🏟```',
    text: '🏟 🏟🏟',
    entities: [{ type: 'pre', offset: 5, length: 2, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\n\r🏟```',
    text: '🏟 🏟🏟',
    entities: [{ type: 'pre', offset: 5, length: 2, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\r\n🏟```',
    text: '🏟 🏟🏟',
    entities: [{ type: 'pre', offset: 5, length: 2, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\n\n🏟```',
    text: '🏟 🏟\n🏟',
    entities: [{ type: 'pre', offset: 5, length: 3, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟\r\r🏟```',
    text: '🏟 🏟\r🏟',
    entities: [{ type: 'pre', offset: 5, length: 3, language: '🏟' }],
  },
  {
    markup: '🏟 🏟```🏟 \\\\\\`🏟```',
    text: '🏟 🏟 \\`🏟',
    entities: [{ type: 'pre', offset: 5, length: 5, language: '🏟' }],
  },
  { markup: '🏟 🏟**', text: '🏟 🏟', entities: [] },
  { markup: '||test||', text: 'test', entities: [{ type: 'spoiler', offset: 0, length: 4 }] },
  { markup: '🏟 🏟``', text: '🏟 🏟', entities: [] },
  { markup: '🏟 🏟``````', text: '🏟 🏟', entities: [] },
  { markup: '🏟 🏟____', text: '🏟 🏟', entities: [] },
  {
    markup: '`_* *_`__*` `*__',
    text: '_* *_ ',
    entities: [{ type: 'code', offset: 0, length: 5 }, { type: 'code', offset: 5, length: 1 }, {
      type: 'bold',
      offset: 5,
      length: 1,
    }, { type: 'underline', offset: 5, length: 1 }],
  },
  {
    markup: '_* * ` `_',
    text: '   ',
    entities: [{ type: 'italic', offset: 0, length: 3 }, { type: 'bold', offset: 0, length: 1 }, {
      type: 'code',
      offset: 2,
      length: 1,
    }],
  },
  { markup: '[](telegram.org)', text: '', entities: [] },
  {
    markup: '[ ](telegram.org)',
    text: ' ',
    entities: [{ type: 'text_link', offset: 0, length: 1, url: 'http://telegram.org/' }],
  },
  { markup: '[ ](as)', text: ' ', entities: [] },
  {
    markup: '[telegram\\.org]',
    text: 'telegram.org',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'http://telegram.org/' }],
  },
  {
    markup: '[telegram\\.org]a',
    text: 'telegram.orga',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'http://telegram.org/' }],
  },
  {
    markup: '[telegram\\.org](telegram.dog)',
    text: 'telegram.org',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'http://telegram.dog/' }],
  },
  {
    markup: '[telegram\\.org](https://telegram.dog?)',
    text: 'telegram.org',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'https://telegram.dog/?' }],
  },
  {
    markup: '[telegram\\.org](https://telegram.dog?\\\\\\()',
    text: 'telegram.org',
    entities: [{ type: 'text_link', offset: 0, length: 12, url: 'https://telegram.dog/?\\(' }],
  },
  { markup: '[telegram\\.org]()', text: 'telegram.org', entities: [] },
  { markup: '[telegram\\.org](asdasd)', text: 'telegram.org', entities: [] },
  {
    markup: '[telegram\\.org](tg:user?id=123456)',
    text: 'telegram.org',
    entities: [{ type: 'text_mention', offset: 0, length: 12, userId: 123456 }],
  },
  {
    markup: '🏟 🏟![👍](TG://EMoJI/?test=1231&id=25#id=32)a',
    text: '🏟 🏟👍a',
    entities: [{ type: 'custom_emoji', offset: 5, length: 2, customEmojiId: '25' }],
  },
  { markup: '🏟 🏟![👍](TG://TiME/?test=1231&unix=25#unix=32)a', dateTimeUnsupported: true },
  { markup: '🏟 🏟![👍](TG://TiME/?test=1231&format=R&unix=25#unix=32)a', dateTimeUnsupported: true },
  {
    markup: '🏟 🏟![👍](TG://TiME/?test=1231&format=dt&unix=25#unix=32)a',
    dateTimeUnsupported: true,
  },
  {
    markup: '🏟 🏟![👍](TG://TiME/?test=1231&format=DT&unix=25#unix=32)a',
    dateTimeUnsupported: true,
  },
  { markup: '🏟 🏟![👍](TG://TiME/?test=1231&format=w&unix=25#unix=32)a', dateTimeUnsupported: true },
  {
    markup: '🏟 🏟![👍](TG://TiME/?test=1231&format=Wt&unix=25#unix=32)a',
    dateTimeUnsupported: true,
  },
  { markup: '> \n> \n>', text: ' \n \n', entities: [{ type: 'blockquote', offset: 0, length: 4 }] },
  {
    markup: '> \\>\n \\> \n>',
    text: ' >\n > \n',
    entities: [{ type: 'blockquote', offset: 0, length: 3 }],
  },
  {
    markup: 'abc\n> \n> \n>\ndef',
    text: 'abc\n \n \n\ndef',
    entities: [{ type: 'blockquote', offset: 4, length: 5 }],
  },
  { markup: '>', text: '', entities: [] },
  { markup: '>a', text: 'a', entities: [{ type: 'blockquote', offset: 0, length: 1 }] },
  { markup: '\r>a', text: '\ra', entities: [{ type: 'blockquote', offset: 1, length: 1 }] },
  {
    markup: '\r\r>\r\ra\r\n\r',
    text: '\r\r\r\ra\r\n\r',
    entities: [{ type: 'blockquote', offset: 2, length: 5 }],
  },
  {
    markup:
      '>*bold _italic bold ~italic bold strikethrough ||italic bold strikethrough spoiler||~ __underline italic bold___ bold*',
    text:
      'bold italic bold italic bold strikethrough italic bold strikethrough spoiler underline italic bold bold',
    entities: [
      { type: 'blockquote', offset: 0, length: 103 },
      { type: 'bold', offset: 0, length: 103 },
      { type: 'italic', offset: 5, length: 93 },
      { type: 'strikethrough', offset: 17, length: 59 },
      { type: 'spoiler', offset: 43, length: 33 },
      { type: 'underline', offset: 77, length: 21 },
    ],
  },
  {
    markup: '>*b\n>ld \n>bo\n>ld*\nasd\ndef',
    text: 'b\nld \nbo\nld\nasd\ndef',
    entities: [{ type: 'blockquote', offset: 0, length: 12 }, {
      type: 'bold',
      offset: 0,
      length: 11,
    }],
  },
  {
    markup: '*a\n>b\n>ld \n>bo\n>ld\nasd*\ndef',
    text: 'a\nb\nld \nbo\nld\nasd\ndef',
    entities: [{ type: 'bold', offset: 0, length: 17 }, {
      type: 'blockquote',
      offset: 2,
      length: 12,
    }],
  },
  {
    markup: '>`b\n>ld \n>bo\nld`\n>asd\ndef',
    text: 'b\n>ld \n>bo\nld\nasd\ndef',
    entities: [{ type: 'blockquote', offset: 0, length: 18 }, {
      type: 'code',
      offset: 0,
      length: 13,
    }],
  },
  {
    markup: '`>b\n>ld \n>bo\nld`\n>asd\ndef',
    text: '>b\n>ld \n>bo\nld\nasd\ndef',
    entities: [{ type: 'code', offset: 0, length: 14 }, {
      type: 'blockquote',
      offset: 15,
      length: 4,
    }],
  },
  { markup: '>1', text: '1', entities: [{ type: 'blockquote', offset: 0, length: 1 }] },
  { markup: '>\n1', text: '\n1', entities: [{ type: 'blockquote', offset: 0, length: 1 }] },
  {
    markup: '>\n\r>2',
    text: '\n\r2',
    entities: [{ type: 'blockquote', offset: 0, length: 1 }, {
      type: 'blockquote',
      offset: 2,
      length: 1,
    }],
  },
  {
    markup: '>\n**>2',
    text: '\n2',
    entities: [{ type: 'blockquote', offset: 0, length: 1 }, {
      type: 'blockquote',
      offset: 1,
      length: 1,
    }],
  },
  { markup: '>**\n>2', text: '\n2', entities: [{ type: 'blockquote', offset: 0, length: 2 }] },
  {
    markup: '>*abcd*',
    text: 'abcd',
    entities: [{ type: 'blockquote', offset: 0, length: 4 }, {
      type: 'bold',
      offset: 0,
      length: 4,
    }],
  },
  {
    markup: '>*abcd*\n',
    text: 'abcd\n',
    entities: [{ type: 'blockquote', offset: 0, length: 5 }, {
      type: 'bold',
      offset: 0,
      length: 4,
    }],
  },
  {
    markup: '*>abcd\n*',
    text: 'abcd\n',
    entities: [{ type: 'blockquote', offset: 0, length: 5 }, {
      type: 'bold',
      offset: 0,
      length: 5,
    }],
  },
  {
    markup: 'abc\n>def\n>def\n\r>ghi2\njkl',
    text: 'abc\ndef\ndef\n\rghi2\njkl',
    entities: [{ type: 'blockquote', offset: 4, length: 8 }, {
      type: 'blockquote',
      offset: 13,
      length: 5,
    }],
  },
  {
    markup: '>asd\n>q||e||w||\nasdad',
    text: 'asd\nqew\nasdad',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 8 }, {
      type: 'spoiler',
      offset: 5,
      length: 1,
    }],
  },
  {
    markup: '>asd\n>q||ew||\nasdad',
    text: 'asd\nqew\nasdad',
    entities: [{ type: 'blockquote', offset: 0, length: 8 }, {
      type: 'spoiler',
      offset: 5,
      length: 2,
    }],
  },
  {
    markup: '>asd\r\n>q||e||w||\r\nasdad',
    text: 'asd\r\nqew\r\nasdad',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 10 }, {
      type: 'spoiler',
      offset: 6,
      length: 1,
    }],
  },
  {
    markup: '>asd\r\n>q||ew||\r\nasdad',
    text: 'asd\r\nqew\r\nasdad',
    entities: [{ type: 'blockquote', offset: 0, length: 10 }, {
      type: 'spoiler',
      offset: 6,
      length: 2,
    }],
  },
  {
    markup: '>asd\r\n>q||e||w||\r\n',
    text: 'asd\r\nqew\r\n',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 10 }, {
      type: 'spoiler',
      offset: 6,
      length: 1,
    }],
  },
  {
    markup: '>asd\r\n>q||ew||\r\n',
    text: 'asd\r\nqew\r\n',
    entities: [{ type: 'blockquote', offset: 0, length: 10 }, {
      type: 'spoiler',
      offset: 6,
      length: 2,
    }],
  },
  {
    markup: '>asd\r\n>q||e||w||',
    text: 'asd\r\nqew',
    entities: [{ type: 'expandable_blockquote', offset: 0, length: 8 }, {
      type: 'spoiler',
      offset: 6,
      length: 1,
    }],
  },
  {
    markup: '>asd\r\n>q||ew||',
    text: 'asd\r\nqew',
    entities: [{ type: 'blockquote', offset: 0, length: 8 }, {
      type: 'spoiler',
      offset: 6,
      length: 2,
    }],
  },
  { markup: '>||', text: '', entities: [] },
];
