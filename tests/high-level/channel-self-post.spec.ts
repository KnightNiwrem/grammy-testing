/**
 * Tests for channel self-posting: `channel.post` dispatching `channel_post`
 * updates in the channel itself, and the `edited_channel_post` payload shape
 * (`sender_chat`, `author_signature`) dispatched by `channel.editPost`.
 */

import assert from 'node:assert';

import { Bot } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { describe, expect, it } from 'vitest';

import { prepareBot } from '../../src/index';

/**
 * Creates a bot capturing every `channel_post` update it receives.
 * @returns The bot plus the captured updates array.
 */
function createChannelPostProbe() {
  const bot = new Bot('test-token');
  const updates: Update[] = [];

  bot.on('channel_post', (ctx) => {
    updates.push(ctx.update);
  });

  return { bot, updates };
}

describe('Channel', () => {
  describe('post', () => {
    describe('positive', () => {
      it('dispatches a channel_post update that reaches bot.on("channel_post")', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel({ title: 'News' });

        await channel.post('Breaking news!');

        expect(updates).toHaveLength(1);
        const post = updates[0]?.channel_post;

        assert.ok(post);
        expect(post.text).toBe('Breaking news!');
        expect(post.chat).toEqual({ id: channel.id, type: 'channel', title: 'News' });
      });

      it('sets sender_chat to the channel itself', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel({ title: 'News' });

        await channel.post('hello');

        const post = updates[0]?.channel_post;

        assert.ok(post);
        expect(post.sender_chat).toEqual(channel.toTelegramChat());
      });

      it('matches grammY channel_post:text filters', async () => {
        const bot = new Bot('test-token');
        let observedText: string | undefined;

        bot.on('channel_post:text', (ctx) => {
          observedText = ctx.channelPost.text;
        });

        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('filtered');

        expect(observedText).toBe('filtered');
      });

      it('returns the dispatched synthetic message', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        const message = await channel.post('returned');

        expect(updates[0]?.channel_post).toEqual(message);
        expect(message.text).toBe('returned');
      });

      it('includes author_signature when the option is provided', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('signed', { author_signature: 'Editor' });

        expect(updates[0]?.channel_post?.author_signature).toBe('Editor');
      });

      it('respects an explicit messageId override', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('pinned id', { messageId: 4242 });

        expect(updates[0]?.channel_post?.message_id).toBe(4242);
      });

      it('auto-fills date and chat on a partial reply_to_message', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel({ title: 'News' });

        await channel.post('reply', { reply_to_message: { message_id: 7 } });

        const replyTo = updates[0]?.channel_post?.reply_to_message;

        assert.ok(replyTo);
        expect(replyTo.message_id).toBe(7);
        expect(replyTo.chat).toEqual(channel.toTelegramChat());
        expect(typeof replyTo.date).toBe('number');
      });

      it('passes a full reply_to_message through unchanged', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        const original = await channel.post('original');

        await channel.post('follow-up', { reply_to_message: original as Message & { message_id: number } });

        expect(updates[1]?.channel_post?.reply_to_message).toEqual(original);
      });

      it('auto-generates increasing message and update ids across posts', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        const first = await channel.post('first');
        const second = await channel.post('second');

        expect(second.message_id).toBeGreaterThan(first.message_id);
        assert.ok(updates[0] && updates[1]);
        expect(updates[1].update_id).toBeGreaterThan(updates[0].update_id);
      });
    });

    describe('negative', () => {
      it('omits the from field, matching real channel posts', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('anonymous');

        const post = updates[0]?.channel_post;

        assert.ok(post);
        expect(post.from).toBeUndefined();
        expect('from' in post).toBe(false);
      });

      it('omits author_signature when the option is not provided', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('unsigned');

        const post = updates[0]?.channel_post;

        assert.ok(post);
        expect('author_signature' in post).toBe(false);
      });

      it('omits reply_to_message when the option is not provided', async () => {
        const { bot, updates } = createChannelPostProbe();
        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('standalone');

        const post = updates[0]?.channel_post;

        assert.ok(post);
        expect('reply_to_message' in post).toBe(false);
      });

      it('does not match message-update listeners', async () => {
        const bot = new Bot('test-token');
        let messageUpdates = 0;

        bot.on('message', () => {
          messageUpdates += 1;
        });

        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.post('not a message update');

        expect(messageUpdates).toBe(0);
      });
    });
  });

  describe('editPost', () => {
    describe('positive', () => {
      it('sets sender_chat to the channel itself, matching real payloads', async () => {
        const bot = new Bot('test-token');
        let observed: Update['edited_channel_post'];

        bot.on('edited_channel_post', (ctx) => {
          observed = ctx.update.edited_channel_post;
        });

        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel({ title: 'News' });

        const post = await channel.post('draft');

        await channel.editPost(post.message_id, 'final');

        assert.ok(observed);
        expect(observed.text).toBe('final');
        expect(observed.sender_chat).toEqual(channel.toTelegramChat());
      });

      it('includes author_signature when the option is provided', async () => {
        const bot = new Bot('test-token');
        let observed: Update['edited_channel_post'];

        bot.on('edited_channel_post', (ctx) => {
          observed = ctx.update.edited_channel_post;
        });

        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.editPost(11, 'signed edit', { author_signature: 'Editor' });

        assert.ok(observed);
        expect(observed.author_signature).toBe('Editor');
      });
    });

    describe('negative', () => {
      it('omits from and author_signature when not provided', async () => {
        const bot = new Bot('test-token');
        let observed: Update['edited_channel_post'];

        bot.on('edited_channel_post', (ctx) => {
          observed = ctx.update.edited_channel_post;
        });

        const { chats } = await prepareBot(bot);
        const channel = chats.newChannel();

        await channel.editPost(12, 'plain edit');

        assert.ok(observed);
        expect('from' in observed).toBe(false);
        expect('author_signature' in observed).toBe(false);
      });
    });
  });
});
