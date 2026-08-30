import { Bot } from 'grammy';
import { describe, expect, it } from 'vitest';

import { GROUP_ANONYMOUS_BOT, prepareBot } from '../../src/index';

describe('user.replies filter rule', () => {
  it('DM reply lands in user.replies', async () => {
    const bot = new Bot('test-token');

    bot.on('message:text', async (ctx) => {
      await ctx.reply('hello');
    });

    const { chats } = await prepareBot(bot);
    const user = chats.newUser();

    await user.sendText('hi');

    expect(chats.repliesFor(user).last?.text).toBe('hello');
  });

  it('Group broadcast does NOT land in user.replies (lands in chat.messages)', async () => {
    const bot = new Bot('test-token');
    const { chats } = await prepareBot(bot);
    const user = chats.newUser();
    const group = chats.newSupergroup();

    group.promote(user); // user is now a member of the group
    chats.repliesFor(user); // ensure inbox exists

    // Bot broadcasts to the group with no addressee:
    await bot.api.sendMessage(group.id, 'broadcast to all');

    expect(group.messages.last?.text).toBe('broadcast to all');
    expect(chats.repliesFor(user).all).toHaveLength(0);
  });

  it('Mention of @username lands in that user.replies', async () => {
    const bot = new Bot('test-token');

    bot.on('message:text', async (ctx) => {
      // Reply with @-mention of the sending user; mark the mention via entities.
      const { username } = ctx.message.from;

      if (!username) {
        return;
      }

      const text = `Welcome, @${username}!`;
      const offset = text.indexOf(`@${username}`);

      await ctx.api.sendMessage(ctx.chat.id, text, {
        entities: [{ type: 'mention', offset, length: username.length + 1 }],
      });
    });

    const { chats } = await prepareBot(bot);
    const group = chats.newSupergroup();
    const alice = chats.newUser({ username: 'alice' });

    group.promote(alice);

    await alice.sendText('hi', { chat: group });

    expect(chats.repliesFor(alice).last?.text).toContain('@alice');
  });

  describe('sendText', () => {
    describe('positive cases', () => {
      it('routes a group reply to the author without routing it to other members', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('answer', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();
        const bob = chats.newUser();

        group.promote(alice);
        group.promote(bob);

        await alice.sendText('question', { chat: group });

        expect(alice.replies.lastOrThrow().text).toBe('answer');
        expect(bob.replies.length).toBe(0);
      });

      it('routes replies within the same forum topic', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.api.sendMessage(ctx.chat.id, 'topic answer', {
            message_thread_id: ctx.message.message_thread_id,
            reply_parameters: { message_id: ctx.message.message_id },
          });
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const topic = forum.newTopic({ name: 'Support' });
        const alice = chats.newUser();

        forum.promote(alice);

        await alice.sendText('topic question', { topic });

        expect(alice.replies.lastOrThrow().text).toBe('topic answer');
      });
    });

    describe('negative cases', () => {
      it('does not route a cross-chat reply reference', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const source = chats.newSupergroup();
        const destination = chats.newSupergroup();
        const alice = chats.newUser();

        source.promote(alice);
        destination.promote(alice);

        const original = await alice.sendText('source message', { chat: source });

        await bot.api.sendMessage(destination.id, 'external reply', {
          reply_parameters: { message_id: original.message_id, chat_id: source.id },
        });

        expect(destination.messages.last?.text).toBe('external reply');
        expect(alice.replies.length).toBe(0);
      });

      it('does not route a reply sent in a different forum topic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const sourceTopic = forum.newTopic({ name: 'Source' });
        const destinationTopic = forum.newTopic({ name: 'Destination' });
        const alice = chats.newUser();

        forum.promote(alice);

        const original = await alice.sendText('source message', { topic: sourceTopic });

        await bot.api.sendMessage(forum.id, 'other-topic reply', {
          message_thread_id: destinationTopic.messageThreadId,
          reply_parameters: { message_id: original.message_id },
        });

        expect(destinationTopic.messages.last?.text).toBe('other-topic reply');
        expect(alice.replies.length).toBe(0);
      });

      it('does not route a reply from an unthreaded message into a forum topic', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const topic = forum.newTopic({ name: 'Destination' });
        const alice = chats.newUser();

        forum.promote(alice);

        const original = await alice.sendText('general message', { chat: forum });

        await bot.api.sendMessage(forum.id, 'topic reply', {
          message_thread_id: topic.messageThreadId,
          reply_parameters: { message_id: original.message_id },
        });

        expect(topic.messages.last?.text).toBe('topic reply');
        expect(alice.replies.length).toBe(0);
      });

      it('does not route a forum-topic reply whose destination topic is omitted', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const topic = forum.newTopic({ name: 'Source' });
        const alice = chats.newUser();

        forum.promote(alice);

        const original = await alice.sendText('topic message', { topic });

        await bot.api.sendMessage(forum.id, 'unthreaded reply', {
          reply_parameters: { message_id: original.message_id },
        });

        expect(forum.messages.last?.text).toBe('unthreaded reply');
        expect(alice.replies.length).toBe(0);
      });

      it('keeps the active-membership gate after the author leaves', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        group.promote(alice);

        const original = await alice.sendText('question', { chat: group });

        await alice.leaveChat(group);

        await bot.api.sendMessage(group.id, 'late answer', {
          reply_parameters: { message_id: original.message_id },
        });

        expect(group.messages.last?.text).toBe('late answer');
        expect(alice.replies.length).toBe(0);
      });

      it('clears author associations in chats.clear()', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        group.promote(alice);

        const original = await alice.sendText('question', { chat: group });

        chats.clear();

        await bot.api.sendMessage(group.id, 'answer after clear', {
          reply_parameters: { message_id: original.message_id },
        });

        expect(group.messages.last?.text).toBe('answer after clear');
        expect(alice.replies.length).toBe(0);
      });

      it('does not attribute anonymous group messages to the user actor', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('anonymous answer', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        group.promote(alice);

        await alice.sendText('anonymous question', { anonymous: true, chat: group });

        expect(group.messages.last?.text).toBe('anonymous answer');
        expect(alice.replies.length).toBe(0);
      });

      it('does not attribute anonymous messages to an actor using the reserved pseudo-user ID', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('anonymous answer', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const anonymousActor = chats.newUser({ id: GROUP_ANONYMOUS_BOT.id });

        group.promote(anonymousActor);

        await anonymousActor.sendText('anonymous question', { anonymous: true, chat: group });

        expect(group.messages.last?.text).toBe('anonymous answer');
        expect(anonymousActor.replies.length).toBe(0);
      });
    });
  });

  describe('sendPhoto', () => {
    describe('positive cases', () => {
      it('tracks authorship for non-text user message verbs', async () => {
        const bot = new Bot('test-token');

        bot.on('message:photo', async (ctx) => {
          await ctx.reply('photo answer', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        group.promote(alice);

        await alice.sendPhoto(undefined, { chat: group });

        expect(alice.replies.lastOrThrow().text).toBe('photo answer');
      });
    });
  });

  describe('editMessage', () => {
    describe('positive cases', () => {
      it('preserves the original author and topic when a message is edited', async () => {
        const bot = new Bot('test-token');
        let editedThreadId: number | undefined;

        bot.on('edited_message', async (ctx) => {
          editedThreadId = ctx.editedMessage.message_thread_id;

          await ctx.api.sendMessage(ctx.chat.id, 'edited answer', {
            message_thread_id: ctx.editedMessage.message_thread_id,
            reply_parameters: { message_id: ctx.editedMessage.message_id },
          });
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const topic = forum.newTopic({ name: 'Support' });
        const alice = chats.newUser();
        const bob = chats.newUser();

        forum.promote(alice);
        forum.promote(bob);

        const original = await alice.sendText('original', { topic });

        await bob.editMessage(original.message_id, 'edited', { chat: forum });

        expect(editedThreadId).toBe(topic.messageThreadId);
        expect(alice.replies.lastOrThrow().text).toBe('edited answer');
        expect(bob.replies.length).toBe(0);
      });
    });

    describe('negative cases', () => {
      it('does not let an edit claim an anonymous message identity', async () => {
        const bot = new Bot('test-token');

        bot.on('edited_message', async (ctx) => {
          await ctx.api.sendMessage(ctx.chat.id, 'edited answer', {
            message_thread_id: ctx.editedMessage.message_thread_id,
            reply_parameters: { message_id: ctx.editedMessage.message_id },
          });
        });

        const { chats } = await prepareBot(bot);
        const forum = chats.newSupergroup({ isForum: true });
        const topic = forum.newTopic({ name: 'Support' });
        const alice = chats.newUser();

        forum.promote(alice);

        const original = await alice.sendText('anonymous original', { anonymous: true, topic });

        await alice.editMessage(original.message_id, 'edited', { chat: forum });

        expect(topic.messages.last?.text).toBe('edited answer');
        expect(alice.replies.length).toBe(0);
      });
    });
  });

  describe('joinChat', () => {
    describe('positive cases', () => {
      it('routes a synchronous reply to a user joining a group', async () => {
        const bot = new Bot('test-token');

        bot.on('message:new_chat_members', async (ctx) => {
          await ctx.reply('welcome', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        await alice.joinChat(group);

        expect(alice.replies.lastOrThrow().text).toBe('welcome');
      });
    });
  });

  describe('leaveChat', () => {
    describe('negative cases', () => {
      it('does not route a synchronous reply to a user leaving a group', async () => {
        const bot = new Bot('test-token');

        bot.on('message:left_chat_member', async (ctx) => {
          await ctx.reply('goodbye', { reply_parameters: { message_id: ctx.message.message_id } });
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();
        const alice = chats.newUser();

        group.promote(alice);

        await alice.leaveChat(group);

        expect(group.messages.last?.text).toBe('goodbye');
        expect(alice.replies.length).toBe(0);
      });
    });
  });
});
