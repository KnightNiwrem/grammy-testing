import { richMessageToPlainText, richTextToPlainText } from './mod.ts';
import type { RichMessage, RichText } from './mod.ts';

Deno.test('richTextToPlainText shows nested text, custom emoji, and button labels', () => {
  const text: RichText = [
    { type: 'bold', text: ['Sale ', { type: 'italic', text: 'now' }] },
    { type: 'anchor', name: 'top' },
    ' ',
    { type: 'custom_emoji', custom_emoji_id: '5', alternative_text: '✈' },
    { type: 'button', button: { text: ' Book', callback_data: 'book' } },
  ];
  const plainText = richTextToPlainText(text);
  if (plainText !== 'Sale now ✈ Book') {
    throw new Error(`Expected the text a client shows, got ${JSON.stringify(plainText)}`);
  }
});

Deno.test('richMessageToPlainText shows each block on its own lines, collapsed content included', () => {
  const message: RichMessage = {
    blocks: [
      { type: 'heading', text: 'Potion', size: 1 },
      { type: 'anchor', name: 'top' },
      {
        type: 'list',
        items: [
          {
            label: 'i.',
            type: 'i',
            value: 1,
            blocks: [
              { type: 'paragraph', text: 'Sources' },
              {
                type: 'list',
                items: [{ label: '•', blocks: [{ type: 'paragraph', text: 'Herb garden' }] }],
              },
            ],
          },
          { label: 'ii.', type: 'i', value: 2, blocks: [{ type: 'paragraph', text: '' }] },
        ],
      },
      { type: 'divider' },
      {
        type: 'table',
        cells: [[
          { text: 'Price', is_header: true, align: 'center', valign: 'middle' },
          { text: '10g', align: 'left', valign: 'middle' },
        ]],
        caption: 'Prices',
      },
      {
        type: 'details',
        summary: 'History',
        blocks: [{ type: 'expandable_blockquote', text: 'Turn 1: Smite', credit: 'Cleric' }],
      },
      {
        type: 'buttons',
        buttons: [{ text: 'Buy', callback_data: 'buy' }, { text: 'Sold out', disabled: {} }],
      },
    ],
  };
  const expected = [
    'Potion',
    'i. Sources',
    '• Herb garden',
    'ii.',
    'Price | 10g',
    'Prices',
    'History',
    'Turn 1: Smite',
    'Cleric',
    'Buy | Sold out',
  ].join('\n');
  const plainText = richMessageToPlainText(message);
  if (plainText !== expected) {
    throw new Error(`Unexpected plain text: ${JSON.stringify(plainText)}`);
  }
});
