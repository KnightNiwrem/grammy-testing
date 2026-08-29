import { Bot } from 'grammy';

/**
 * Creates a bot that forwards /post commands to a target channel and pins
 * incoming channel posts that start with a pin marker (📌).
 * @param channelId - The Telegram channel ID to post messages to.
 * @returns A configured Bot instance.
 */
export function createChannelPostBot(channelId: number) {
  const bot = new Bot('token');

  bot.command('post', async (ctx) => {
    const text = ctx.match;

    if (!text) {
      await ctx.reply('Usage: /post <text>');

      return;
    }

    await ctx.api.sendMessage(channelId, text);
    await ctx.reply('Posted to channel!');
  });

  bot.on('channel_post:text', async (ctx) => {
    if (ctx.channelPost.text.startsWith('📌')) {
      await ctx.pinChatMessage(ctx.channelPost.message_id);
    }
  });

  return bot;
}
