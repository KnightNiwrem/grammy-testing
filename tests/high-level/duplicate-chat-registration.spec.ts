import { Bot } from 'grammy';
import { describe, expect, it } from 'vitest';

import { prepareBot } from '../../src/index';

describe('Chats', () => {
  describe('newGroup', () => {
    describe('positive', () => {
      it('registers distinct explicit IDs side by side', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const first = chats.newGroup({ id: -100, title: 'First' });
        const second = chats.newGroup({ id: -200, title: 'Second' });

        expect(first.id).toBe(-100);
        expect(second.id).toBe(-200);
        expect([...chats.allChats]).toContain(first);
        expect([...chats.allChats]).toContain(second);
      });
    });

    describe('negative', () => {
      it('throws when the explicit ID is already registered to another group', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        chats.newGroup({ id: -100, title: 'Original' });

        expect(() => chats.newGroup({ id: -100, title: 'Duplicate' })).toThrow(/already registered/);
      });

      it('throws when the explicit ID is already registered to a supergroup', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const forum = chats.newSupergroup({ title: 'Support Forum', isForum: true });

        expect(() => chats.newGroup({ id: forum.id, title: 'Imposter' })).toThrow(/already registered/);
      });

      it('throws when the explicit ID is already registered to a private chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const user = chats.newUser();
        const privateChat = chats.newPrivateChat(user);

        expect(() => chats.newGroup({ id: privateChat.id, title: 'Imposter' })).toThrow(/already registered/);
      });

      it('keeps routing bound to the original actor after a rejected registration', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('ack');
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newGroup({ id: -100, title: 'Original' });
        const user = chats.newUser();

        expect(() => chats.newGroup({ id: -100, title: 'Duplicate' })).toThrow(/already registered/);

        await user.sendText('hello', { chat: group });

        expect(group.messages.last?.text).toBe('ack');
      });
    });
  });

  describe('newSupergroup', () => {
    describe('negative', () => {
      it('throws when the explicit ID is already registered to another chat type', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const group = chats.newGroup({ id: -100, title: 'Original' });

        expect(() => chats.newSupergroup({ id: group.id, title: 'Duplicate' })).toThrow(/already registered/);
      });
    });
  });

  describe('newChannel', () => {
    describe('negative', () => {
      it('throws when the explicit ID is already registered to another chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const channel = chats.newChannel({ id: -500, title: 'Alerts' });

        expect(() => chats.newChannel({ id: channel.id, title: 'Duplicate' })).toThrow(/already registered/);
      });
    });
  });

  describe('newPrivateChat', () => {
    describe('positive', () => {
      it('keeps returning the same private chat on repeated calls for the same user', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const user = chats.newUser();
        const first = chats.newPrivateChat(user);
        const second = chats.newPrivateChat(user);

        expect(second).toBe(first);
      });
    });
  });
});
