import { createExternalReply } from '../src/types/message_reply.ts';
import type { PrivateMessage, SupergroupContentMessage } from '../src/types/virtual_message.ts';

const ACCOUNT_ID = 1_000_001;
const BOT_ID = 1_000_002;
const SUPERGROUP_ID = -1_000_000_000_001;

Deno.test('createExternalReply shows a supergroup text message as its origin and a quote', () => {
  const message: SupergroupContentMessage = {
    kind: 'supergroup_message',
    id: 'message',
    chatId: SUPERGROUP_ID,
    author: { kind: 'account', accountId: ACCOUNT_ID },
    sentAtUnixSeconds: 1_700_000_000,
    content: {
      kind: 'text',
      text: 'Ship it now',
      entities: [
        { type: 'bold', offset: 0, length: 4 },
        { type: 'code', offset: 8, length: 3 },
      ],
    },
    isContentProtected: false,
  };

  const reply = createExternalReply(message, 42);
  const expected = {
    externalReply: {
      origin: { originalSenderId: ACCOUNT_ID, originalSentAtUnixSeconds: 1_700_000_000 },
      supergroupMessage: { chatId: SUPERGROUP_ID, messageId: 42 },
    },
    quote: {
      text: { text: 'Ship it now', entities: [{ type: 'bold', offset: 0, length: 4 }] },
      position: 0,
      isManual: false,
    },
  };
  if (JSON.stringify(reply) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected the supergroup message and its quote, received ${JSON.stringify(reply)}`,
    );
  }
});

Deno.test('createExternalReply keeps private media without its caption, which it quotes', () => {
  const caption = `${'a'.repeat(1_023)}😀😀`;
  const message: PrivateMessage = {
    kind: 'private_message',
    id: 'message',
    conversation: { accountId: ACCOUNT_ID, botId: BOT_ID },
    authorRole: 'bot',
    sentAtUnixSeconds: 1_700_000_000,
    content: {
      kind: 'photo',
      fileId: 'photo',
      caption: {
        text: caption,
        // The quote keeps 1,024 characters: the first emoji ends it at UTF-16 offset 1,025.
        entities: [
          { type: 'italic', offset: 1_021, length: 4 },
          { type: 'custom_emoji', offset: 1_023, length: 2, customEmojiId: '1' },
          { type: 'custom_emoji', offset: 1_025, length: 2, customEmojiId: '2' },
          { type: 'custom_emoji', offset: 1_023, length: 4, customEmojiId: '3' },
          { type: 'bold', offset: 1_021, length: 6 },
        ],
      },
      hasSpoiler: true,
      showsCaptionAboveMedia: true,
    },
    isContentProtected: false,
  };

  const { externalReply, quote } = createExternalReply(message, 7);
  const expectedMedia = {
    kind: 'photo' as const,
    fileId: 'photo',
    caption: { text: '', entities: [] },
    hasSpoiler: true,
    showsCaptionAboveMedia: true,
  };
  const expectedEntities = [
    { type: 'italic', offset: 1_021, length: 4 },
    { type: 'custom_emoji', offset: 1_023, length: 2, customEmojiId: '1' },
    { type: 'bold', offset: 1_021, length: 4 },
  ];
  if (
    externalReply.supergroupMessage !== undefined ||
    externalReply.origin.originalSenderId !== BOT_ID ||
    JSON.stringify(externalReply.media) !== JSON.stringify(expectedMedia) ||
    quote?.text.text !== `${'a'.repeat(1_023)}😀` ||
    JSON.stringify(quote.text.entities) !== JSON.stringify(expectedEntities)
  ) {
    throw new Error(
      `Expected the photo and its caption truncated to 1,024 characters, received ${
        JSON.stringify({ externalReply, quote })
      }`,
    );
  }

  const withoutCaption = createExternalReply({ ...message, content: expectedMedia }, 7);
  if (withoutCaption.quote !== undefined) {
    throw new Error('Expected media without a caption to have no quote');
  }
});
