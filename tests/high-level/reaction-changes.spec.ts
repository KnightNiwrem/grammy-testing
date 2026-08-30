import { Bot, GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { prepareBot } from '../../src/index';

describe('ReactionChangesLog', () => {
  describe('setMessageReaction', () => {
    describe('positive cases', () => {
      it('captures replacement reaction details globally and on the target chat', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [{ type: 'emoji', emoji: '👍' }], { is_big: true });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        await user.sendText('react');

        const change = chat.reactionChanges.lastOrThrow();

        expect(change).toBe(chats.reactionChanges.lastOrThrow());

        expect(change).toMatchObject({
          chatId: chat.id,
          reaction: [{ type: 'emoji', emoji: '👍' }],
          isBig: true,
        });

        expect(typeof change.messageId).toBe('number');
        expect(change.raw).toMatchObject({ is_big: true });
      });

      it('uses an empty replacement set when reaction is omitted', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.api.raw.setMessageReaction({ chat_id: ctx.chat.id, message_id: ctx.message.message_id });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        await user.sendText('remove reaction');

        expect(chat.reactionChanges.lastOrThrow().reaction).toEqual([]);
      });

      it('resolves the target when the bot reacts to a captured reply', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          const reply = await ctx.reply('target');

          await ctx.api.setMessageReaction(ctx.chat.id, reply.message_id, [{ type: 'custom_emoji', custom_emoji_id: 'emoji-1' }]);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        await user.sendText('react');

        expect(chat.reactionChanges.lastOrThrow().reply).toBe(user.replies.lastOrThrow());
      });

      it('resolves the target when a canned send response replaces the message ID', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          const reply = await ctx.reply('target');

          await ctx.api.setMessageReaction(ctx.chat.id, reply.message_id, [{ type: 'emoji', emoji: '👍' }]);
        });

        const { chats } = await prepareBot(bot, {
          responses: { sendMessage: { message_id: 9999, date: 0 } },
        });

        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        await user.sendText('react');

        const change = chat.reactionChanges.lastOrThrow();

        expect(change.messageId).toBe(9999);
        expect(change.reply).toBe(user.replies.lastOrThrow());
      });

      it('resolves the target when respondNext replaces the message ID', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          const reply = await ctx.reply('target');

          await ctx.api.setMessageReaction(ctx.chat.id, reply.message_id, [{ type: 'emoji', emoji: '👍' }]);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        chats.outgoing.respondNext('sendMessage', { message_id: 8888, date: 0 });

        await user.sendText('react');

        const change = chat.reactionChanges.lastOrThrow();

        expect(change.messageId).toBe(8888);
        expect(change.reply).toBe(user.replies.lastOrThrow());
      });

      it('resolves every returned media-group message ID to the captured reply', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          const replies = await ctx.api.sendMediaGroup(ctx.chat.id, [
            { type: 'photo', media: 'file-a' },
            { type: 'photo', media: 'file-b' },
          ]);

          await ctx.api.setMessageReaction(ctx.chat.id, replies[1].message_id, [{ type: 'emoji', emoji: '👍' }]);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const chat = chats.newPrivateChat(user);

        await user.sendText('react');

        const change = chat.reactionChanges.lastOrThrow();

        expect(change.messageId).not.toBe(user.replies.lastOrThrow().messageId);
        expect(change.reply).toBe(user.replies.lastOrThrow());
      });

      it('keeps per-chat projections independent and preserves global order', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const first = chats.newSupergroup('first');
        const second = chats.newSupergroup('second');

        await bot.api.setMessageReaction(first.id, 10, [{ type: 'emoji', emoji: '👍' }]);
        await bot.api.setMessageReaction(second.id, 20, [{ type: 'emoji', emoji: '🔥' }]);

        expect(first.reactionChanges.all).toHaveLength(1);
        expect(second.reactionChanges.all).toHaveLength(1);
        expect(chats.reactionChanges.all.map(({ chatId }) => chatId)).toEqual([first.id, second.id]);
      });

      it('records an attempted change even when the simulated API call fails', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const chat = chats.newSupergroup();

        chats.outgoing.failNext('setMessageReaction', { code: 400, description: 'REACTION_INVALID' });

        await expect(bot.api.setMessageReaction(chat.id, 10, [{ type: 'emoji', emoji: '👍' }])).rejects.toBeInstanceOf(GrammyError);
        expect(chat.reactionChanges.length).toBe(1);
      });

      it('is cleared by chats.clear()', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const chat = chats.newSupergroup();

        await bot.api.setMessageReaction(chat.id, 10, [{ type: 'emoji', emoji: '👍' }]);
        chats.clear();

        expect(chat.reactionChanges.length).toBe(0);
        expect(chats.reactionChanges.length).toBe(0);
      });
    });

    describe('negative cases', () => {
      it('keeps unregistered-chat changes globally without inventing a chat projection', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await bot.api.setMessageReaction(-999_888, 10, [{ type: 'emoji', emoji: '👍' }]);

        expect(chats.reactionChanges.lastOrThrow()).toMatchObject({ chatId: -999_888, messageId: 10, reply: undefined });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('setMessageReaction'));

        warnSpy.mockRestore();
      });

      it('throws when lastOrThrow is used on an empty log', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        expect(() => chats.reactionChanges.lastOrThrow()).toThrow('Expected a reaction change but the log is empty');
      });
    });
  });
});
