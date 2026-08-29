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

      it('skips explicitly claimed IDs when auto-generating group IDs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        // -1_000_000_000 is the first value of the auto-generated group ID range.
        const explicit = chats.newGroup({ id: -1_000_000_000, title: 'Explicit' });
        const auto = chats.newGroup('Auto');

        expect(auto.id).not.toBe(explicit.id);
        expect([...chats.allChats]).toContain(explicit);
        expect([...chats.allChats]).toContain(auto);
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
    describe('positive', () => {
      it('skips explicitly claimed IDs when auto-generating supergroup IDs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        // -1_001_000_000_000 is the first value of the auto-generated supergroup ID range.
        const explicit = chats.newSupergroup({ id: -1_001_000_000_000, title: 'Explicit' });
        const auto = chats.newSupergroup('Auto');

        expect(auto.id).not.toBe(explicit.id);
      });
    });

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
    describe('positive', () => {
      it('skips explicitly claimed IDs when auto-generating channel IDs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        // -1_002_000_000_000 is the first value of the auto-generated channel ID range.
        const explicit = chats.newChannel({ id: -1_002_000_000_000, title: 'Explicit' });
        const auto = chats.newChannel('Auto');

        expect(auto.id).not.toBe(explicit.id);
      });
    });

    describe('negative', () => {
      it('throws when the explicit ID is already registered to another chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        const channel = chats.newChannel({ id: -500, title: 'Alerts' });

        expect(() => chats.newChannel({ id: channel.id, title: 'Duplicate' })).toThrow(/already registered/);
      });
    });
  });

  describe('newUser', () => {
    describe('positive', () => {
      it('skips IDs claimed by registered chats when auto-generating user IDs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        // 100_000_000 is the first value of the auto-generated user ID range.
        const occupying = chats.newSupergroup({ id: 100_000_000, title: 'Occupying' });
        const user = chats.newUser();

        expect(user.id).not.toBe(occupying.id);
        expect(() => chats.newPrivateChat(user)).not.toThrow();
      });
    });

    describe('negative', () => {
      it('throws when the explicit user ID is already minted', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        chats.newUser({ id: 42, first_name: 'First' });

        expect(() => chats.newUser({ id: 42, first_name: 'Second' })).toThrow(/already minted/);
      });

      it('rejects duplicate user IDs so reply routing stays with the original owner', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('ack');
        });

        const { chats } = await prepareBot(bot);
        const owner = chats.newUser({ id: 4242 });

        chats.newPrivateChat(owner);

        expect(() => chats.newUser({ id: 4242 })).toThrow(/already minted/);

        await owner.sendText('hello');

        expect(chats.repliesFor(owner).last?.text).toBe('ack');
      });

      it('throws when the ID is already registered to a foreign private chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const { chats: other } = await prepareBot(new Bot('other-token'));

        // The foreign user is absent from this orchestrator's user registry, so only
        // the chat registry can reveal that the ID's private chat is already owned.
        const foreign = other.newUser({ id: 4242 });

        chats.newPrivateChat(foreign);

        expect(() => chats.newUser({ id: 4242 })).toThrow(/already registered/);
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

      it('keeps returning the same private chat for a user minted by another orchestrator', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const { chats: other } = await prepareBot(new Bot('other-token'));

        // No user entry exists in `chats` for this user, so the registry lookup
        // (not the per-user fast path) must provide the reuse.
        const foreign = other.newUser({ id: 4242 });
        const first = chats.newPrivateChat(foreign);
        const second = chats.newPrivateChat(foreign);

        expect(second).toBe(first);
      });
    });

    describe('negative', () => {
      it('throws when the ID is registered to a private chat owned by a different user actor', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const { chats: otherA } = await prepareBot(new Bot('other-token-a'));
        const { chats: otherB } = await prepareBot(new Bot('other-token-b'));

        // Duplicate user IDs throw within one orchestrator, so distinct user objects
        // sharing an ID must come from separate orchestrators.
        const original = otherA.newUser({ id: 4242 });
        const imposter = otherB.newUser({ id: 4242 });

        const originalChat = chats.newPrivateChat(original);

        expect(() => chats.newPrivateChat(imposter)).toThrow(/different user actor/);
        expect(chats.newPrivateChat(original)).toBe(originalChat);
      });

      it('throws for a foreign user object whose ID matches a minted user owning a private chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const { chats: other } = await prepareBot(new Bot('other-token'));

        // The users-registry entry for 4242 belongs to `mine`; the foreign object must
        // not receive the cached chat through the per-user fast path.
        const mine = chats.newUser({ id: 4242 });
        const mineChat = chats.newPrivateChat(mine);
        const foreign = other.newUser({ id: 4242 });

        expect(() => chats.newPrivateChat(foreign)).toThrow(/different user actor/);
        expect(chats.newPrivateChat(mine)).toBe(mineChat);
      });

      it('throws for a foreign user object whose ID matches a minted user without a private chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const { chats: other } = await prepareBot(new Bot('other-token'));

        // No private chat exists yet, so without a guard the foreign object would
        // register one whose replies route to the minted user's inbox by numeric ID.
        chats.newUser({ id: 4242 });
        const foreign = other.newUser({ id: 4242 });

        expect(() => chats.newPrivateChat(foreign)).toThrow(/different user actor/);
      });

      it('throws when the user ID is already registered to a non-private chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);

        chats.newGroup({ id: 42, title: 'Original' });
        const user = chats.newUser({ id: 42 });

        expect(() => chats.newPrivateChat(user)).toThrow(/already registered/);
      });

      it('rejects default private sends that would take over a registered chat ID', async () => {
        const bot = new Bot('test-token');

        bot.on('message:text', async (ctx) => {
          await ctx.reply('ack');
        });

        const { chats } = await prepareBot(bot);
        const group = chats.newGroup({ id: 42, title: 'Original' });
        const user = chats.newUser({ id: 42 });

        // No options.chat: sendText defaults to the user's private chat, whose ID
        // collides with the group registered above.
        await expect(user.sendText('hello')).rejects.toThrow(/already registered/);

        const outsider = chats.newUser();

        await outsider.sendText('hello', { chat: group });

        expect(group.messages.last?.text).toBe('ack');
      });
    });
  });
});
