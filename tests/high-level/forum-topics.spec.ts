import { Bot } from 'grammy';
import { describe, expect, it } from 'vitest';

import { ForumTopic, prepareBot } from '../../src/index';

describe('forum supergroups and topics', () => {
  describe('Chats#newSupergroup', () => {
    describe('positive', () => {
      it('marks a supergroup as a forum via isForum: true', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        expect(forum.isForum).toBe(true);
      });

      it('includes is_forum: true in toTelegramChat for forums', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        expect(forum.toTelegramChat()).toEqual({
          id: forum.id,
          type: 'supergroup',
          title: 'Support Forum',
          is_forum: true,
        });
      });
    });

    describe('negative', () => {
      it('keeps non-forum supergroups free of is_forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const plain = chats.newSupergroup('Plain');
        const explicitlyPlain = chats.newSupergroup({ title: 'Also Plain', isForum: false });

        expect(plain.isForum).toBe(false);
        expect(plain.toTelegramChat()).not.toHaveProperty('is_forum');
        expect(explicitlyPlain.isForum).toBe(false);
        expect(explicitlyPlain.toTelegramChat()).not.toHaveProperty('is_forum');
      });
    });
  });

  describe('Supergroup#newTopic', () => {
    describe('positive', () => {
      it('registers multiple topics with stable, unique message_thread_id values', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const shipping = forum.newTopic({ name: 'Shipping' });

        expect(billing.messageThreadId).toBe(42);
        expect(billing.name).toBe('Billing');
        expect(billing.forum).toBe(forum);
        expect(shipping.messageThreadId).not.toBe(billing.messageThreadId);
        expect(forum.topicByThreadId(42)).toBe(billing);
        expect(forum.topicByThreadId(shipping.messageThreadId)).toBe(shipping);
        expect([...forum.allTopics]).toEqual([billing, shipping]);
      });

      it('skips explicitly registered IDs when auto-generating thread IDs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        const auto = forum.newTopic({ name: 'Auto' });
        const explicit = forum.newTopic({ name: 'Explicit', messageThreadId: auto.messageThreadId + 1 });
        const nextAuto = forum.newTopic({ name: 'Next Auto' });

        expect(nextAuto.messageThreadId).not.toBe(explicit.messageThreadId);
        expect(forum.topicByThreadId(nextAuto.messageThreadId)).toBe(nextAuto);
        expect([...forum.allTopics]).toHaveLength(3);
      });
    });

    describe('negative', () => {
      it('throws when the supergroup is not a forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const plain = chats.newSupergroup('Plain');

        expect(() => plain.newTopic({ name: 'Billing' })).toThrow(/not a forum/);
      });

      it('throws when the message_thread_id is already registered', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        expect(() => forum.newTopic({ name: 'Duplicate', messageThreadId: 42 })).toThrow(/already registered/);
      });
    });
  });

  describe('User#sendText with topic', () => {
    describe('positive', () => {
      it('dispatches is_topic_message and message_thread_id to the handler', async () => {
        const bot = new Bot('test-token');
        let captured: { messageThreadId?: number; isTopicMessage?: boolean; chatId?: number } = {};

        bot.on('message:text', (ctx) => {
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

        const message = await user.sendText('I need help with an invoice', { chat: forum, topic: billing });

        expect(captured.messageThreadId).toBe(42);
        expect(captured.isTopicMessage).toBe(true);
        expect(captured.chatId).toBe(forum.id);
        expect(message.message_thread_id).toBe(42);
        expect(message.is_topic_message).toBe(true);
      });

      it('defaults the target chat to the topic parent forum when chat is omitted', async () => {
        const bot = new Bot('test-token');
        let capturedChatId: number | undefined;

        bot.on('message:text', (ctx) => {
          capturedChatId = ctx.message.chat.id;
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await user.sendText('hello', { topic: billing });

        expect(capturedChatId).toBe(forum.id);
      });

      it('records ctx.reply against the same topic', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('Your invoice is ready');
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await user.sendText('I need help with an invoice', { chat: forum, topic: billing });

        const reply = forum.messages.last;

        expect(reply?.topic).toBe(billing);
        expect(reply?.messageThreadId).toBe(42);
        expect(billing.messages.byText('Your invoice is ready')).toBeDefined();
      });
    });

    describe('negative', () => {
      it('throws when options.chat is not the topic parent forum', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const other = chats.newSupergroup('Other');
        const billing = forum.newTopic({ name: 'Billing' });
        const user = chats.newUser();

        await expect(user.sendText('hello', { chat: other, topic: billing })).rejects.toThrow(/belongs to forum/);
      });

      it('throws when options.chat is a different chat object with the same numeric ID', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing' });
        const imposter = chats.newGroup({ id: forum.id, title: 'Imposter' });
        const user = chats.newUser();

        await expect(user.sendText('hello', { chat: imposter, topic: billing })).rejects.toThrow(/belongs to forum/);
      });

      it('throws for a topic object that was not registered via newTopic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const detached = new ForumTopic(forum, 'Detached', 999);
        const user = chats.newUser();

        await expect(user.sendText('hello', { topic: detached })).rejects.toThrow(/not registered/);
      });
    });
  });

  describe('User#sendCommand with topic', () => {
    describe('positive', () => {
      it('dispatches the command into the topic', async () => {
        const bot = new Bot('test-token');
        let capturedThreadId: number | undefined;

        bot.command('help', (ctx) => {
          capturedThreadId = ctx.message?.message_thread_id;
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const user = chats.newUser();

        await user.sendCommand('help', undefined, { topic: billing });

        expect(capturedThreadId).toBe(42);
      });
    });
  });

  describe('topic-scoped message logs', () => {
    describe('positive', () => {
      it('associates explicit Bot API sends carrying message_thread_id with the topic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        await bot.api.sendMessage(forum.id, 'invoice update', { message_thread_id: 42 });

        expect(billing.messages.last?.text).toBe('invoice update');
        expect(billing.messages.last?.topic).toBe(billing);
      });

      it('keeps all topic messages in the parent forum log while topic projections stay scoped', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const shipping = forum.newTopic({ name: 'Shipping', messageThreadId: 43 });

        await bot.api.sendMessage(forum.id, 'billing note', { message_thread_id: 42 });
        await bot.api.sendMessage(forum.id, 'shipping note', { message_thread_id: 43 });
        await bot.api.sendMessage(forum.id, 'general note');

        expect(forum.messages.length).toBe(3);
        expect(billing.messages.length).toBe(1);
        expect(shipping.messages.length).toBe(1);
        expect(billing.messages.byText('shipping note')).toBeUndefined();
      });

      it('isolates two topics even when their messages have identical text', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });
        const shipping = forum.newTopic({ name: 'Shipping', messageThreadId: 43 });

        await bot.api.sendMessage(forum.id, 'same text', { message_thread_id: 42 });
        await bot.api.sendMessage(forum.id, 'same text', { message_thread_id: 43 });

        expect(billing.messages.byText('same text')).toBe(billing.messages.last);
        expect(shipping.messages.byText('same text')).toBe(shipping.messages.last);
        expect(billing.messages.byText('same text')).not.toBe(shipping.messages.byText('same text'));
      });

      it('clears topic logs via chats.clear()', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        await bot.api.sendMessage(forum.id, 'billing note', { message_thread_id: 42 });
        chats.clear();

        expect(billing.messages.length).toBe(0);
      });
    });

    describe('negative', () => {
      it('keeps unknown thread IDs inspectable without associating a registered topic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        await bot.api.sendMessage(forum.id, 'stray note', { message_thread_id: 999 });

        const reply = forum.messages.last;

        expect(reply?.messageThreadId).toBe(999);
        expect(reply?.topic).toBeUndefined();
        expect(billing.messages.length).toBe(0);
      });
    });
  });

  describe('synthetic sent-message responses', () => {
    describe('positive', () => {
      it('preserves topic metadata in the default sendMessage response', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        const sent = await bot.api.sendMessage(forum.id, 'invoice update', { message_thread_id: 42 });

        expect(sent.message_thread_id).toBe(42);
        expect(sent.is_topic_message).toBe(true);
        expect(sent.chat.id).toBe(forum.id);
      });

      it('preserves topic metadata in every default sendMediaGroup response message', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        const sent = await bot.api.sendMediaGroup(
          forum.id,
          [
            { type: 'photo', media: 'file-1' },
            { type: 'photo', media: 'file-2' },
          ],
          { message_thread_id: 42 },
        );

        expect(sent).toHaveLength(2);

        for (const message of sent) {
          expect(message.message_thread_id).toBe(42);
          expect(message.is_topic_message).toBe(true);
        }
      });
    });
  });

  describe('Reply#clickButton', () => {
    describe('positive', () => {
      it('preserves topic metadata in the generated callback query message', async () => {
        const bot = new Bot('test-token');
        let captured: { messageThreadId?: number; isTopicMessage?: boolean } = {};

        bot.on('callback_query:data', (ctx) => {
          captured = {
            messageThreadId: ctx.callbackQuery.message?.message_thread_id,
            isTopicMessage: ctx.callbackQuery.message?.is_topic_message,
          };
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });
        const billing = forum.newTopic({ name: 'Billing', messageThreadId: 42 });

        await bot.api.sendMessage(forum.id, 'pick one', {
          message_thread_id: billing.messageThreadId,
          reply_markup: { inline_keyboard: [[{ text: 'Invoices', callback_data: 'invoices' }]] },
        });

        await forum.messages.last?.clickButton('Invoices');

        expect(captured.messageThreadId).toBe(42);
        expect(captured.isTopicMessage).toBe(true);
      });
    });
  });
});
