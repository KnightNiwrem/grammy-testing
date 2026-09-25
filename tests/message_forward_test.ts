import { createMessageForward, isForwardable } from '../src/types/message_forward.ts';
import type { PrivateMessage, SupergroupMessage } from '../src/types/virtual_message.ts';

const ACCOUNT_ID = 1_000_001;
const BOT_ID = 1_000_002;
const INLINE_BOT_ID = 1_000_003;

function accountMessage(overrides: Partial<PrivateMessage> = {}): PrivateMessage {
  return {
    kind: 'private_message',
    id: 'message',
    conversation: { accountId: ACCOUNT_ID, botId: BOT_ID },
    authorRole: 'account',
    sentAtUnixSeconds: 1_700_000_000,
    content: { kind: 'text', text: 'Hello', entities: [] },
    isContentProtected: false,
    ...overrides,
  };
}

Deno.test('createMessageForward shows the original sender and the inline bot of a message', () => {
  const forward = createMessageForward(
    accountMessage({ viaBot: { botId: INLINE_BOT_ID, inlineMessageId: 'inline' } }),
  );

  const expected = {
    content: { kind: 'text', text: 'Hello', entities: [] },
    forwardInfo: {
      originalSenderId: ACCOUNT_ID,
      originalSentAtUnixSeconds: 1_700_000_000,
      viaBotId: INLINE_BOT_ID,
    },
  };
  if (JSON.stringify(forward) !== JSON.stringify(expected)) {
    throw new Error(`Expected the forward to show its origin, received ${JSON.stringify(forward)}`);
  }
});

Deno.test('createMessageForward keeps the origin of a forward and only URL keyboards', () => {
  const originalForwardInfo = {
    originalSenderId: INLINE_BOT_ID,
    originalSentAtUnixSeconds: 1_600_000_000,
  };
  const urlKeyboard = [[{ kind: 'url', text: 'Open', url: 'https://example.com/' }] as const];
  const botForward: PrivateMessage = accountMessage({
    authorRole: 'bot',
    forwardInfo: originalForwardInfo,
    inlineKeyboard: urlKeyboard,
  });
  const callbackKeyboardMessage = accountMessage({
    authorRole: 'bot',
    inlineKeyboard: [[{ kind: 'callback', text: 'Go', callbackData: 'go' }], ...urlKeyboard],
  });

  const forwardOfForward = createMessageForward(botForward);
  const forwardOfCallbackKeyboard = createMessageForward(callbackKeyboardMessage);
  if (
    forwardOfForward.forwardInfo !== originalForwardInfo ||
    forwardOfForward.inlineKeyboard !== urlKeyboard ||
    forwardOfCallbackKeyboard.forwardInfo.originalSenderId !== BOT_ID ||
    forwardOfCallbackKeyboard.inlineKeyboard !== undefined
  ) {
    throw new Error(
      `Expected forwards to keep origins and URL keyboards, received ${
        JSON.stringify({ forwardOfForward, forwardOfCallbackKeyboard })
      }`,
    );
  }
});

Deno.test('isForwardable refuses protected content and service messages', () => {
  const serviceMessage: SupergroupMessage = {
    kind: 'supergroup_message',
    id: 'service',
    chatId: -1_000_000_000_001,
    author: { kind: 'account', accountId: ACCOUNT_ID },
    sentAtUnixSeconds: 1_700_000_000,
    content: { kind: 'members_joined', memberIds: [BOT_ID] },
    isContentProtected: false,
  };

  const forwardability = [
    isForwardable(accountMessage()),
    isForwardable(accountMessage({ authorRole: 'bot', isContentProtected: true })),
    isForwardable(serviceMessage),
  ];
  if (JSON.stringify(forwardability) !== JSON.stringify([true, false, false])) {
    throw new Error(
      `Expected only unprotected content to be forwardable, received ${forwardability}`,
    );
  }
});
