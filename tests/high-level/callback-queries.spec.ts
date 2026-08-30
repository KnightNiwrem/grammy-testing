import assert from 'node:assert';

import { Bot, InlineKeyboard } from 'grammy';
import { describe, expect, it } from 'vitest';

import { prepareBot } from '../../src/index';

describe('CallbackQueryHandle', () => {
  describe('clickButton', () => {
    describe('positive cases', () => {
      it('correlates the complete answer by callback-query ID', async () => {
        const bot = new Bot('test-token');

        bot.command('start', async (ctx) => {
          await ctx.reply('choose', { reply_markup: new InlineKeyboard().text('Accept', 'accept') });
        });

        bot.on('callback_query:data', async (ctx) => {
          await ctx.api.raw.answerCallbackQuery({
            callback_query_id: ctx.callbackQuery.id,
            text: 'Accepted',
            show_alert: true,
            url: 'https://t.me/example_bot?start=accepted',
            cache_time: 15,
          });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        const click = await user.replies.lastOrThrow().clickButton('Accept');

        expect(click.callbackData).toBe('accept');

        expect(click.answer).toMatchObject({
          callbackQueryId: click.id,
          text: 'Accepted',
          showAlert: true,
          url: 'https://t.me/example_bot?start=accepted',
          cacheTime: 15,
        });

        expect(click.answer?.raw).toMatchObject({ callback_query_id: click.id, show_alert: true });
      });

      it('keeps unanswered clicks observable without throwing', async () => {
        const bot = new Bot('test-token');

        bot.command('start', async (ctx) => {
          await ctx.reply('choose', { reply_markup: new InlineKeyboard().text('Skip', 'skip') });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        const click = await user.replies.lastOrThrow().clickButton('Skip');

        expect(click.answer).toBeUndefined();
      });

      it('keeps identical callback data correlated to each distinct query', async () => {
        const bot = new Bot('test-token');
        let answerNumber = 0;

        bot.command('start', async (ctx) => {
          await ctx.reply('choose', { reply_markup: new InlineKeyboard().text('Again', 'same-data') });
        });

        bot.on('callback_query:data', async (ctx) => {
          answerNumber += 1;
          await ctx.answerCallbackQuery(`answer-${String(answerNumber)}`);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        const reply = user.replies.lastOrThrow();
        const first = await reply.clickButton('Again');
        const second = await reply.clickButton('Again');

        expect(first.id).not.toBe(second.id);
        expect(first.answer?.text).toBe('answer-1');
        expect(second.answer?.text).toBe('answer-2');
      });

      it('uses one stable chat_instance across different messages in the same chat', async () => {
        const bot = new Bot('test-token');
        const instances: string[] = [];

        bot.command('start', async (ctx) => {
          await ctx.reply('first', { reply_markup: new InlineKeyboard().text('First', 'first') });
          await ctx.reply('second', { reply_markup: new InlineKeyboard().text('Second', 'second') });
        });

        bot.on('callback_query:data', (ctx) => {
          instances.push(ctx.callbackQuery.chat_instance);
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        const [first, second] = user.replies.all;

        assert.ok(first);
        assert.ok(second);

        await first.clickButton('First');
        await second.clickButton('Second');

        expect(instances).toEqual([`inst-${String(user.id)}`, `inst-${String(user.id)}`]);
      });

      it('attributes a group click to options.by and routes only that dispatch replies to the user', async () => {
        const bot = new Bot('test-token');
        let clickerId: number | undefined;

        bot.on('callback_query:data', async (ctx) => {
          clickerId = ctx.from.id;
          await ctx.reply('click response');
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const group = chats.newGroup();

        group.join(user);

        await bot.api.sendMessage(group.id, 'choose', { reply_markup: new InlineKeyboard().text('Go', 'go') });

        const reply = group.messages.last;

        assert.ok(reply);

        await reply.clickButton('Go', { by: user });

        expect(clickerId).toBe(user.id);
        expect(user.replies.lastOrThrow().text).toBe('click response');

        const repliesAfterClick = user.replies.length;

        await bot.api.sendMessage(group.id, 'later broadcast');

        expect(user.replies.length).toBe(repliesAfterClick);
      });

      it('isolates concurrent group clicks by different users', async () => {
        const bot = new Bot('test-token');

        bot.on('callback_query:data', async (ctx) => {
          await Promise.resolve();
          await ctx.reply(`for-${String(ctx.from.id)}`);
        });

        const { chats } = await prepareBot(bot);
        const first = chats.newUser();
        const second = chats.newUser();
        const group = chats.newGroup();

        group.join(first);
        group.join(second);

        await bot.api.sendMessage(group.id, 'choose', { reply_markup: new InlineKeyboard().text('Go', 'go') });

        const reply = group.messages.last;

        assert.ok(reply);

        await Promise.all([reply.clickButton('Go', { by: first }), reply.clickButton('Go', { by: second })]);

        expect(first.replies.all.map(({ text }) => text)).toEqual([`for-${String(first.id)}`]);
        expect(second.replies.all.map(({ text }) => text)).toEqual([`for-${String(second.id)}`]);
      });
    });

    describe('negative cases', () => {
      it('does not attach an answer sent for a different query ID', async () => {
        const bot = new Bot('test-token');

        bot.command('start', async (ctx) => {
          await ctx.reply('choose', { reply_markup: new InlineKeyboard().text('Go', 'go') });
        });

        bot.on('callback_query:data', async (ctx) => {
          await ctx.api.answerCallbackQuery(`${ctx.callbackQuery.id}-other`, { text: 'wrong answer' });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        const click = await user.replies.lastOrThrow().clickButton('Go');

        expect(click.answer).toBeUndefined();
      });

      it('requires an explicit clicker outside private chats', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newGroup();

        await bot.api.sendMessage(group.id, 'choose', { reply_markup: new InlineKeyboard().text('Go', 'go') });

        const reply = group.messages.last;

        assert.ok(reply);

        await expect(reply.clickButton('Go')).rejects.toThrow(/options\.by is required/);
      });

      it('rejects buttons that do not produce callback_query.data', async () => {
        const bot = new Bot('test-token');

        bot.command('start', async (ctx) => {
          await ctx.reply('search', {
            reply_markup: { inline_keyboard: [[{ text: 'Search', switch_inline_query: 'cats' }]] },
          });
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        await user.sendCommand('/start');

        await expect(user.replies.lastOrThrow().clickButton('Search')).rejects.toThrow(/only callback-data buttons/);
      });
    });
  });

  describe('sendCallbackQuery', () => {
    describe('positive cases', () => {
      it('returns the same live answer handle for standalone queries', async () => {
        const bot = new Bot('test-token');

        bot.on('callback_query:data', async (ctx) => {
          await ctx.answerCallbackQuery('standalone answer');
        });

        const { chats } = await prepareBot(bot);
        const user = chats.newUser();

        const query = await user.sendCallbackQuery('standalone');

        expect(query.callbackData).toBe('standalone');
        expect(query.answer?.callbackQueryId).toBe(query.id);
        expect(query.answer?.text).toBe('standalone answer');
      });
    });
  });
});
