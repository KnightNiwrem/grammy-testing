import { Bot } from 'grammy';
import type { Message } from 'grammy/types';
import { describe, expect, it } from 'vitest';

import type { User, UserSendOptions } from '../../src/index';
import { ForumTopic, GROUP_ANONYMOUS_BOT, prepareBot } from '../../src/index';

// One row per user send verb that accepts the shared `UserSendOptions`
// (`chat`, `topic`, `reply_to_message`, `anonymous`).
const VERBS: [string, (user: User, options: UserSendOptions) => Promise<Message>][] = [
  ['sendText', async (user, options) => user.sendText('hello', options)],
  ['sendCommand', async (user, options) => user.sendCommand('help', undefined, options)],
  ['sendPhoto', async (user, options) => user.sendPhoto(undefined, options)],
  ['sendDocument', async (user, options) => user.sendDocument(undefined, options)],
  ['sendVideo', async (user, options) => user.sendVideo(undefined, options)],
  ['sendAudio', async (user, options) => user.sendAudio(undefined, options)],
  ['sendVoice', async (user, options) => user.sendVoice(undefined, options)],
  ['sendVideoNote', async (user, options) => user.sendVideoNote(undefined, options)],
  ['sendAnimation', async (user, options) => user.sendAnimation(undefined, options)],
  ['sendSticker', async (user, options) => user.sendSticker(undefined, options)],
  ['sendLocation', async (user, options) => user.sendLocation(50.4, 30.5, options)],
  ['sendContact', async (user, options) => user.sendContact('+15550000000', 'Alice', options)],
  ['sendVenue', async (user, options) => user.sendVenue(50.4, 30.5, 'HQ', '1 Main St', options)],
  ['sendPoll', async (user, options) => user.sendPoll('Which?', ['A', 'B'], options)],
  ['sendDice', async (user, options) => user.sendDice('🎲', options)],
];

describe('User', () => {
  describe.each(VERBS)('%s (shared send options)', (_verb, send) => {
    describe('positive', () => {
      it('dispatches message_thread_id and is_topic_message into a forum topic', async () => {
        const bot = new Bot('test-token');
        let captured: { messageThreadId?: number; isTopicMessage?: boolean; chatId?: number } = {};

        bot.on('message', (ctx) => {
          captured = {
            messageThreadId: ctx.message.message_thread_id,
            isTopicMessage: ctx.message.is_topic_message,
            chatId: ctx.message.chat.id,
          };
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        const message = await send(user, { topic: billing });

        expect(captured.messageThreadId).toBe(42);
        expect(captured.isTopicMessage).toBe(true);
        expect(captured.chatId).toBe(forum.id);
        expect(message.message_thread_id).toBe(42);
        expect(message.is_topic_message).toBe(true);
      });

      it('records bot replies from inside the topic against the same topic', async () => {
        const bot = new Bot('test-token');

        bot.on('message', async (ctx) => {
          await ctx.reply('acknowledged');
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await send(user, { chat: forum, topic: billing });

        expect(forum.messages.last?.topic).toBe(billing);
        expect(billing.messages.byText('acknowledged')).toBeDefined();
      });

      it('dispatches as GroupAnonymousBot with sender_chat when anonymous: true', async () => {
        const bot = new Bot('test-token');
        let capturedFromId: number | undefined;
        let capturedSenderChatId: number | undefined;

        bot.on('message', (ctx) => {
          capturedFromId = ctx.message.from.id;
          capturedSenderChatId = ctx.message.sender_chat?.id;
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        const message = await send(user, { chat: group, anonymous: true });

        expect(capturedFromId).toBe(GROUP_ANONYMOUS_BOT.id);
        expect(capturedSenderChatId).toBe(group.id);
        expect(message.from).toMatchObject({ id: GROUP_ANONYMOUS_BOT.id, username: 'GroupAnonymousBot' });
        expect(message.sender_chat?.id).toBe(group.id);
      });

      it('quotes reply_to_message on the dispatched message', async () => {
        const bot = new Bot('test-token');
        let capturedReplyToId: number | undefined;
        let capturedReplyChatId: number | undefined;

        bot.on('message', (ctx) => {
          capturedReplyToId = ctx.message.reply_to_message?.message_id;
          capturedReplyChatId = ctx.message.reply_to_message?.chat.id;
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        await send(user, { chat: group, reply_to_message: { message_id: 7 } });

        expect(capturedReplyToId).toBe(7);
        expect(capturedReplyChatId).toBe(group.id);
      });

      it('synthesizes reply_to_message from reply_parameters alone', async () => {
        const bot = new Bot('test-token');
        let capturedReplyToId: number | undefined;
        let capturedReplyChatId: number | undefined;

        bot.on('message', (ctx) => {
          capturedReplyToId = ctx.message.reply_to_message?.message_id;
          capturedReplyChatId = ctx.message.reply_to_message?.chat.id;
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        await send(user, { chat: group, reply_parameters: { message_id: 11 } });

        expect(capturedReplyToId).toBe(11);
        expect(capturedReplyChatId).toBe(group.id);
      });

      it('prefers the richer reply_to_message when both reply options are given', async () => {
        const bot = new Bot('test-token');
        let capturedReplyToId: number | undefined;

        bot.on('message', (ctx) => {
          capturedReplyToId = ctx.message.reply_to_message?.message_id;
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        await send(user, { chat: group, reply_parameters: { message_id: 11 }, reply_to_message: { message_id: 12 } });

        expect(capturedReplyToId).toBe(12);
      });

      it('combines topic and reply_to_message on one dispatched message', async () => {
        const bot = new Bot('test-token');
        let captured: { messageThreadId?: number; replyToId?: number } = {};

        bot.on('message', (ctx) => {
          captured = {
            messageThreadId: ctx.message.message_thread_id,
            replyToId: ctx.message.reply_to_message?.message_id,
          };
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await send(user, { topic: billing, reply_to_message: { message_id: 9 } });

        expect(captured.messageThreadId).toBe(42);
        expect(captured.replyToId).toBe(9);
      });
    });

    describe('negative', () => {
      it('throws for a topic object that was not registered via newTopic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const detached = new ForumTopic(forum, 'Detached', 999);
        const user = chats.newUser();

        await expect(send(user, { topic: detached })).rejects.toThrow(/not registered/);
      });

      it('throws when options.chat is not the topic parent forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const other = chats.newSupergroup('Other');
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await expect(send(user, { chat: other, topic: billing })).rejects.toThrow(/belongs to forum/);
      });

      it('throws for anonymous: true outside group contexts', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await expect(send(user, { anonymous: true })).rejects.toThrow(/Group or Supergroup/);
      });
    });
  });

  describe('sendMediaGroup (shared send options)', () => {
    describe('positive', () => {
      it('applies topic metadata to every message of the album', async () => {
        const bot = new Bot('test-token');
        const captured: { messageThreadId?: number; isTopicMessage?: boolean; chatId?: number }[] = [];

        bot.on('message', (ctx) => {
          captured.push({
            messageThreadId: ctx.message.message_thread_id,
            isTopicMessage: ctx.message.is_topic_message,
            chatId: ctx.message.chat.id,
          });
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        const messages = await user.sendMediaGroup([{ photo: 'file-1' }, { video: 'file-2' }], { topic: billing });

        expect(messages).toHaveLength(2);
        expect(captured).toHaveLength(2);

        for (const entry of captured) {
          expect(entry.messageThreadId).toBe(42);
          expect(entry.isTopicMessage).toBe(true);
          expect(entry.chatId).toBe(forum.id);
        }
      });

      it('applies anonymous and reply_to_message to every message of the album', async () => {
        const bot = new Bot('test-token');
        const captured: { fromId?: number; senderChatId?: number; replyToId?: number }[] = [];

        bot.on('message', (ctx) => {
          captured.push({
            fromId: ctx.message.from.id,
            senderChatId: ctx.message.sender_chat?.id,
            replyToId: ctx.message.reply_to_message?.message_id,
          });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        await user.sendMediaGroup([{ photo: 'file-1' }, { photo: 'file-2' }], {
          chat: group,
          anonymous: true,
          reply_to_message: { message_id: 7 },
        });

        expect(captured).toHaveLength(2);

        for (const entry of captured) {
          expect(entry.fromId).toBe(GROUP_ANONYMOUS_BOT.id);
          expect(entry.senderChatId).toBe(group.id);
          expect(entry.replyToId).toBe(7);
        }
      });

      it('resolves reply and anonymous metadata against each item chat override', async () => {
        const bot = new Bot('test-token');
        const captured: { chatId?: number; replyChatId?: number; senderChatId?: number }[] = [];

        bot.on('message', (ctx) => {
          captured.push({
            chatId: ctx.message.chat.id,
            replyChatId: ctx.message.reply_to_message?.chat.id,
            senderChatId: ctx.message.sender_chat?.id,
          });
        });

        const { chats } = await prepareBot(bot);
        const groupA = chats.newSupergroup('Dev Chat A');
        const groupB = chats.newSupergroup('Dev Chat B');
        const user = chats.newUser();

        await user.sendMediaGroup([{ photo: 'file-1' }, { photo: 'file-2', chat: groupB }], {
          chat: groupA,
          anonymous: true,
          reply_to_message: { message_id: 7 },
        });

        expect(captured).toEqual([
          { chatId: groupA.id, replyChatId: groupA.id, senderChatId: groupA.id },
          { chatId: groupB.id, replyChatId: groupB.id, senderChatId: groupB.id },
        ]);
      });
    });

    describe('negative', () => {
      it('throws when an item chat is not the topic parent forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const other = chats.newSupergroup('Other');
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await expect(user.sendMediaGroup([{ photo: 'file-1', chat: other }], { topic: billing })).rejects.toThrow(/belongs to forum/);
      });

      it('dispatches nothing when a later item chat fails topic validation', async () => {
        const bot = new Bot('test-token');
        let dispatchedCount = 0;

        bot.on('message', () => {
          dispatchedCount += 1;
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const other = chats.newSupergroup('Other');
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await expect(user.sendMediaGroup([{ photo: 'file-1' }, { photo: 'file-2', chat: other }], { topic: billing })).rejects.toThrow(
          /belongs to forum/,
        );

        expect(dispatchedCount).toBe(0);
        expect(forum.messages.length).toBe(0);
      });

      it('throws when anonymous: true meets a non-group item chat, before any dispatch', async () => {
        const bot = new Bot('test-token');
        let dispatchedCount = 0;

        bot.on('message', () => {
          dispatchedCount += 1;
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const channel = chats.newChannel('Announcements');
        const user = chats.newUser();

        await expect(
          user.sendMediaGroup([{ photo: 'file-1' }, { photo: 'file-2', chat: channel }], { chat: group, anonymous: true }),
        ).rejects.toThrow(/Group or Supergroup/);

        expect(dispatchedCount).toBe(0);
      });

      it('throws for anonymous: true without a group target chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await expect(user.sendMediaGroup([{ photo: 'file-1' }], { anonymous: true })).rejects.toThrow(/Group or Supergroup/);
      });
    });
  });

  describe('sendPhoto (ID allocation)', () => {
    describe('positive', () => {
      it('mints consecutive stub file IDs across successful sends', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        const first = await user.sendPhoto();
        const second = await user.sendPhoto();

        expect(first.photo?.[0].file_id).toBe('stub-file-1');
        expect(second.photo?.[0].file_id).toBe('stub-file-2');
      });
    });

    describe('negative', () => {
      it('does not consume stub file IDs when validation rejects the send', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await expect(user.sendPhoto(undefined, { anonymous: true })).rejects.toThrow(/Group or Supergroup/);

        const message = await user.sendPhoto();

        expect(message.photo?.[0].file_id).toBe('stub-file-1');
      });
    });
  });

  describe('sendMediaGroup (ID allocation)', () => {
    describe('positive', () => {
      it('accepts an anonymous album whose items all target their own group', async () => {
        const bot = new Bot('test-token');
        let captured: { fromId?: number; senderChatId?: number } = {};

        bot.on('message', (ctx) => {
          captured = { fromId: ctx.message.from.id, senderChatId: ctx.message.sender_chat?.id };
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup('Dev Chat');
        const user = chats.newUser();

        const messages = await user.sendMediaGroup([{ photo: 'file-1', chat: group }], { anonymous: true });

        expect(messages).toHaveLength(1);
        expect(captured.fromId).toBe(GROUP_ANONYMOUS_BOT.id);
        expect(captured.senderChatId).toBe(group.id);
      });
    });

    describe('negative', () => {
      it('still validates the shared options for an empty album', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await expect(user.sendMediaGroup([], { anonymous: true })).rejects.toThrow(/Group or Supergroup/);

        await expect(user.sendMediaGroup([])).resolves.toEqual([]);
      });

      it('does not consume the media-group ID when validation rejects the album', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await expect(user.sendMediaGroup([{ photo: 'file-1' }], { anonymous: true })).rejects.toThrow(/Group or Supergroup/);

        const messages = await user.sendMediaGroup([{ photo: 'file-2' }]);

        expect(messages[0].media_group_id).toBe('mg-1');
      });
    });
  });

  describe('sendPoll (ID allocation)', () => {
    describe('positive', () => {
      it('allocates the message_id before the poll token, matching pre-0.29 order', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        const message = await user.sendPoll('Which?', ['A', 'B']);

        expect(message.poll?.id).toBe(`poll-${String(message.message_id + 1)}`);
      });
    });

    describe('negative', () => {
      it('does not consume message IDs when validation rejects the send', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        const before = await user.sendText('before');

        await expect(user.sendPoll('Which?', ['A', 'B'], { anonymous: true })).rejects.toThrow(/Group or Supergroup/);

        const after = await user.sendText('after');

        expect(after.message_id).toBe(before.message_id + 1);
      });
    });
  });

  describe('sendCallbackQuery (topic option)', () => {
    describe('positive', () => {
      it('carries topic metadata on the embedded callback_query.message', async () => {
        const bot = new Bot('test-token');
        let captured: { messageThreadId?: number; isTopicMessage?: boolean; chatId?: number } = {};

        bot.on('callback_query:data', (ctx) => {
          captured = {
            messageThreadId: ctx.callbackQuery.message?.message_thread_id,
            isTopicMessage: ctx.callbackQuery.message?.is_topic_message,
            chatId: ctx.callbackQuery.message?.chat.id,
          };
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await user.sendCallbackQuery('invoices', { topic: billing });

        expect(captured.messageThreadId).toBe(42);
        expect(captured.isTopicMessage).toBe(true);
        expect(captured.chatId).toBe(forum.id);
      });

      it('lets explicit options.message fields win over topic metadata', async () => {
        const bot = new Bot('test-token');
        let capturedThreadId: number | undefined;

        bot.on('callback_query:data', (ctx) => {
          capturedThreadId = ctx.callbackQuery.message?.message_thread_id;
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await user.sendCallbackQuery('invoices', { topic: billing, message: { message_id: 5, message_thread_id: 7 } });

        expect(capturedThreadId).toBe(7);
      });
    });

    describe('negative', () => {
      it('throws for a topic object that was not registered via newTopic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const detached = new ForumTopic(forum, 'Detached', 999);
        const user = chats.newUser();

        await expect(user.sendCallbackQuery('invoices', { topic: detached })).rejects.toThrow(/not registered/);
      });

      it('throws when options.chat is not the topic parent forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const other = chats.newSupergroup('Other');
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await expect(user.sendCallbackQuery('invoices', { chat: other, topic: billing })).rejects.toThrow(/belongs to forum/);
      });
    });
  });
});
