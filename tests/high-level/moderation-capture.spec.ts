import assert from 'node:assert';

import { Bot, GrammyError } from 'grammy';
import type { ChatMember } from 'grammy/types';
import { describe, expect, it, vi } from 'vitest';

import { prepareBot } from '../../src/index';

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Returns the current Unix timestamp in seconds.
 * @returns The current time in seconds.
 */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('moderation capture', () => {
  describe('banChatMember', () => {
    describe('positive', () => {
      it('logs a ban action with the resolved User actor and payload fields', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        const untilDate = nowSeconds() + 3600;

        await bot.api.banChatMember(group.id, target.id, { until_date: untilDate, revoke_messages: true });

        const action = group.moderation.bans.lastOrThrow();

        expect(action.kind).toBe('ban');
        expect(action.method).toBe('banChatMember');
        expect(action.userId).toBe(target.id);
        expect(action.user).toBe(target);
        expect(action.untilDate).toBe(untilDate);
        expect(action.revokeMessages).toBe(true);
        expect(action.raw.chat_id).toBe(group.id);
      });

      it('sets the membership to kicked with a valid until_date preserved', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        const untilDate = nowSeconds() + 3600;

        await bot.api.banChatMember(group.id, target.id, { until_date: untilDate });

        expect(target.in(group)?.status).toBe('kicked');
        expect(target.in(group)?.untilDate).toBe(untilDate);
      });

      it('treats an until_date under 30 seconds away as banned forever', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id, { until_date: nowSeconds() + 10 });

        expect(target.in(group)?.status).toBe('kicked');
        expect(target.in(group)?.untilDate).toBeUndefined();
      });

      it('treats an until_date over 366 days away as banned forever', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id, { until_date: nowSeconds() + 400 * DAY_SECONDS });

        expect(target.in(group)?.untilDate).toBeUndefined();
      });

      it('ignores until_date in basic groups (applied for supergroups and channels only)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newGroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id, { until_date: nowSeconds() + 3600 });

        expect(target.in(group)?.status).toBe('kicked');
        expect(target.in(group)?.untilDate).toBeUndefined();
      });

      it('is reflected by the getChatMember resolver', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newAdmin();
        const target = chats.newUser();
        const group = chats.defaultGroup;

        assert.ok(group);
        group.join(target);

        let result: ChatMember | undefined;

        bot.command('ban', async (ctx) => {
          await ctx.banChatMember(target.id);
          result = await ctx.api.getChatMember(ctx.chat.id, target.id);
        });

        await admin.sendCommand('/ban', undefined, { chat: group });
        await chats.idle();

        expect(result?.status).toBe('kicked');
        assert.ok(result?.status === 'kicked');
        expect(result.until_date).toBe(0);
      });
    });

    describe('negative', () => {
      it('logs but does not mutate membership when the target is the creator', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const owner = chats.newUser();
        const group = chats.newSupergroup();

        group.own(owner);
        await bot.api.banChatMember(group.id, owner.id);

        expect(group.moderation.bans.length).toBe(1);
        expect(owner.in(group)?.status).toBe('creator');
      });

      it('logs but does not mutate membership when the target is an administrator', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newUser();
        const group = chats.newSupergroup();

        group.promote(admin);
        await bot.api.banChatMember(group.id, admin.id);

        expect(group.moderation.bans.length).toBe(1);
        expect(admin.in(group)?.status).toBe('administrator');
      });

      it('logs with user undefined and skips membership sync for an unminted user id', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();

        await bot.api.banChatMember(group.id, 424_242);

        const action = group.moderation.bans.lastOrThrow();

        expect(action.userId).toBe(424_242);
        expect(action.user).toBeUndefined();
        expect(group.members.has(424_242)).toBe(false);
      });

      it('warns for an unregistered chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
          await bot.api.banChatMember(999_999, target.id);

          expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('banChatMember'));
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('skips private chats silently', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const user = chats.newUser();
        const privateChat = chats.newPrivateChat(user);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        try {
          await bot.api.banChatMember(privateChat.id, user.id);

          expect(warnSpy).not.toHaveBeenCalled();
        } finally {
          warnSpy.mockRestore();
        }
      });

      it('does not mutate membership when the call fails via failNext, but still logs the attempt', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        chats.outgoing.failNext('banChatMember', { code: 400, description: 'Bad Request: not enough rights' });

        await expect(bot.api.banChatMember(group.id, target.id)).rejects.toBeInstanceOf(GrammyError);

        expect(target.in(group)?.status).toBe('member');
        expect(group.moderation.bans.length).toBe(1);
      });

      it('applies membership sync again once a later call succeeds after a failNext failure', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        chats.outgoing.failNext('banChatMember', { code: 400, description: 'Bad Request' });

        await expect(bot.api.banChatMember(group.id, target.id)).rejects.toBeInstanceOf(GrammyError);
        await bot.api.banChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('kicked');
        expect(group.moderation.bans.length).toBe(2);
      });
    });
  });

  describe('unbanChatMember', () => {
    describe('positive', () => {
      it('moves a banned user to left', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id);
        await bot.api.unbanChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('left');
        expect(group.moderation.unbans.byUser(target).length).toBe(1);
      });

      it('removes an active member when only_if_banned is not set (Bot API guarantee)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.unbanChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('left');
      });

      it('unbans a kicked user when only_if_banned is set', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id);
        await bot.api.unbanChatMember(group.id, target.id, { only_if_banned: true });

        expect(target.in(group)?.status).toBe('left');
      });
    });

    describe('negative', () => {
      it('logs but does not sync membership in a basic group (supergroup/channel-only method)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newGroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id);
        await bot.api.unbanChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('kicked');
        expect(group.moderation.unbans.length).toBe(1);
      });

      it('never removes an administrator (Telegram requires demotion first)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newUser();
        const group = chats.newSupergroup();

        group.promote(admin);
        await bot.api.unbanChatMember(group.id, admin.id);

        expect(admin.in(group)?.status).toBe('administrator');
        expect(group.moderation.unbans.length).toBe(1);
      });

      it('does nothing to an active member when only_if_banned is set, but still logs', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.unbanChatMember(group.id, target.id, { only_if_banned: true });

        expect(target.in(group)?.status).toBe('member');

        const action = group.moderation.unbans.lastOrThrow();

        expect(action.onlyIfBanned).toBe(true);
      });
    });
  });

  describe('restrictChatMember', () => {
    describe('positive', () => {
      it('sets restricted status with the given permissions and until_date', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        const untilDate = nowSeconds() + 3600;

        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false }, { until_date: untilDate });

        const membership = target.in(group);

        expect(membership?.status).toBe('restricted');
        expect(membership?.permissions.can_send_messages).toBe(false);
        expect(membership?.untilDate).toBe(untilDate);
      });

      it('returns complete restricted shapes from getChatMember with omitted permissions as false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newAdmin();
        const target = chats.newUser();
        const group = chats.defaultGroup;

        assert.ok(group);
        group.join(target);

        let result: ChatMember | undefined;

        bot.command('restrict', async (ctx) => {
          await ctx.restrictChatMember(target.id, { can_send_messages: false });
          result = await ctx.api.getChatMember(ctx.chat.id, target.id);
        });

        await admin.sendCommand('/restrict', undefined, { chat: group });
        await chats.idle();

        assert.ok(result?.status === 'restricted');
        expect(result.can_send_messages).toBe(false);
        expect(result.can_send_polls).toBe(false);
        expect(result.can_invite_users).toBe(false);
      });

      it('resolves group.restrict() partial permissions with complete restricted shapes', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const sender = chats.newUser();
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(sender);
        group.restrict(target, { can_send_messages: false });

        let result: ChatMember | undefined;

        bot.on('message', async (ctx) => {
          result = await ctx.api.getChatMember(ctx.chat.id, target.id);
        });

        await sender.sendText('ping', { chat: group });
        await chats.idle();

        assert.ok(result?.status === 'restricted');
        expect(result.can_react_to_messages).toBe(false);
        expect((result as unknown as Record<string, unknown>).can_edit_tag).toBe(false);
      });

      it('applies the implied-permission grouping: can_send_other_messages grants media sends', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_other_messages: true });

        const action = group.moderation.restrictions.lastOrThrow();

        expect(action.permissions?.can_send_messages).toBe(true);
        expect(action.permissions?.can_send_photos).toBe(true);
        expect(action.permissions?.can_send_voice_notes).toBe(true);
      });

      it('applies the implied-permission grouping: can_send_polls grants can_send_messages', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_polls: true });

        const action = group.moderation.restrictions.lastOrThrow();

        expect(action.permissions?.can_send_messages).toBe(true);
        expect(action.permissions?.can_send_photos).toBeUndefined();
      });

      it('keeps permissions independent when use_independent_chat_permissions is set', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        await bot.api.restrictChatMember(
          group.id,
          target.id,
          { can_send_other_messages: true },
          { use_independent_chat_permissions: true },
        );

        const action = group.moderation.restrictions.lastOrThrow();

        expect(action.permissions?.can_send_messages).toBeUndefined();
        expect(action.permissions?.can_send_photos).toBeUndefined();
      });

      it('lifts restrictions back to member when every permission is granted', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false });

        expect(target.in(group)?.status).toBe('restricted');

        await bot.api.restrictChatMember(group.id, target.id, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true,
          can_manage_topics: true,
        });

        expect(target.in(group)?.status).toBe('member');
      });

      it('defaults can_react_to_messages, can_manage_topics, and can_edit_tag from their source flags when omitted', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: true, can_pin_messages: false });

        const action = group.moderation.restrictions.lastOrThrow();

        expect(action.permissions?.can_react_to_messages).toBe(true);
        expect(action.permissions?.can_manage_topics).toBe(false);
        expect(action.permissions?.can_edit_tag).toBe(false);
      });

      it('lifts restrictions when can_manage_topics is omitted but defaults to a granted can_pin_messages', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        await bot.api.restrictChatMember(group.id, target.id, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true,
        });

        expect(target.in(group)?.status).toBe('member');
      });
    });

    describe('negative', () => {
      it('does not lift restrictions when can_edit_tag stays explicitly false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        await bot.api.restrictChatMember(group.id, target.id, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true,
          can_manage_topics: true,
          can_edit_tag: false,
        });

        expect(target.in(group)?.status).toBe('restricted');
      });

      it('never mutates the creator', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const owner = chats.newUser();
        const group = chats.newSupergroup();

        group.own(owner);
        await bot.api.restrictChatMember(group.id, owner.id, { can_send_messages: false });

        expect(owner.in(group)?.status).toBe('creator');
        expect(group.moderation.restrictions.length).toBe(1);
      });

      it('never mutates an administrator (Telegram requires demotion first)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newUser();
        const group = chats.newSupergroup();

        group.promote(admin);
        await bot.api.restrictChatMember(group.id, admin.id, { can_send_messages: false });

        expect(admin.in(group)?.status).toBe('administrator');
        expect(group.moderation.restrictions.length).toBe(1);
      });

      it('fills omitted derived permissions as false, not undefined, in the resolved shape', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newAdmin();
        const target = chats.newUser();
        const group = chats.defaultGroup;

        assert.ok(group);
        group.join(target);

        let result: ChatMember | undefined;

        bot.command('restrict', async (ctx) => {
          await ctx.restrictChatMember(target.id, { can_send_messages: false });
          result = await ctx.api.getChatMember(ctx.chat.id, target.id);
        });

        await admin.sendCommand('/restrict', undefined, { chat: group });
        await chats.idle();

        assert.ok(result?.status === 'restricted');
        expect(result.can_manage_topics).toBe(false);
        expect((result as unknown as Record<string, unknown>).can_edit_tag).toBe(false);

        const action = group.moderation.restrictions.lastOrThrow();

        expect(action.permissions?.can_react_to_messages).toBe(false);
        expect(action.permissions?.can_edit_tag).toBe(false);
      });

      it('logs but does not sync membership in a basic group (supergroup-only method)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newGroup();

        group.join(target);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false });

        expect(target.in(group)?.status).toBe('member');
        expect(group.moderation.restrictions.length).toBe(1);
      });

      it('does not mutate membership when a raw non-OK response is configured', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        chats.outgoing.respondNextRaw('restrictChatMember', { ok: false, error_code: 400, description: 'Bad Request' });

        await expect(bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false })).rejects.toBeInstanceOf(GrammyError);

        expect(target.in(group)?.status).toBe('member');
      });

      it('keeps is_member false when restricting a user who is not in the chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false });

        const membership = target.in(group);

        expect(membership?.status).toBe('restricted');
        expect(membership?.permissions.is_member).toBe(false);

        const result = await bot.api.getChatMember(group.id, target.id);

        assert.ok(result.status === 'restricted');
        expect(result.is_member).toBe(false);
      });

      it('lifting all restrictions from a non-member leaves them left, not member', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false });

        await bot.api.restrictChatMember(group.id, target.id, {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true,
          can_manage_topics: true,
        });

        expect(target.in(group)?.status).toBe('left');
      });
    });
  });

  describe('promoteChatMember', () => {
    describe('positive', () => {
      it('promotes to administrator with the granted rights and implied can_manage_chat', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.promoteChatMember(group.id, target.id, { can_delete_messages: true });

        const membership = target.in(group);

        expect(membership?.status).toBe('administrator');
        expect(membership?.permissions.can_delete_messages).toBe(true);
        expect(membership?.permissions.can_manage_chat).toBe(true);

        const action = group.moderation.promotions.lastOrThrow();

        expect(action.kind).toBe('promote');
        expect(action.user).toBe(target);
      });

      it('demotes an administrator back to member when all rights are false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.promote(target);
        await bot.api.promoteChatMember(group.id, target.id, { is_anonymous: false, can_manage_chat: false, can_delete_messages: false });

        expect(target.in(group)?.status).toBe('member');

        const action = group.moderation.demotions.lastOrThrow();

        expect(action.kind).toBe('demote');
      });

      it('keeps the implied can_manage_chat true even when the payload passes it as false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.promoteChatMember(group.id, target.id, { can_manage_chat: false, can_delete_messages: true });

        const membership = target.in(group);

        expect(membership?.status).toBe('administrator');
        expect(membership?.permissions.can_manage_chat).toBe(true);
      });

      it('defaults can_restrict_members to true for channel promotions', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const channel = chats.newChannel();

        await bot.api.promoteChatMember(channel.id, target.id);

        const action = channel.moderation.promotions.lastOrThrow();

        expect(action.kind).toBe('promote');
        expect(action.permissions?.can_restrict_members).toBe(true);
        expect(target.in(channel)?.status).toBe('administrator');
        expect(target.in(channel)?.permissions.can_restrict_members).toBe(true);
      });

      it('returns complete administrator shapes from getChatMember with omitted rights as false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const admin = chats.newAdmin();
        const target = chats.newUser();
        const group = chats.defaultGroup;

        assert.ok(group);
        group.join(target);

        let result: ChatMember | undefined;

        bot.command('promote', async (ctx) => {
          await ctx.promoteChatMember(target.id, { can_delete_messages: true });
          result = await ctx.api.getChatMember(ctx.chat.id, target.id);
        });

        await admin.sendCommand('/promote', undefined, { chat: group });
        await chats.idle();

        assert.ok(result?.status === 'administrator');
        expect(result.can_delete_messages).toBe(true);
        expect(result.can_change_info).toBe(false);
        expect(result.can_promote_members).toBe(false);
        expect((result as unknown as Record<string, unknown>).can_manage_tags).toBe(false);
      });

      it('resolves partial channel promotions with channel-only admin booleans defaulted to false', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const channel = chats.newChannel();

        await bot.api.promoteChatMember(channel.id, target.id, { can_post_stories: true });

        const result = (await bot.api.getChatMember(channel.id, target.id)) as ChatMember & Record<string, unknown>;

        assert.ok(result.status === 'administrator');
        expect(result.can_post_stories).toBe(true);
        expect(result.can_post_messages).toBe(false);
        expect(result.can_edit_messages).toBe(false);
      });

      it('demotes a channel administrator when can_restrict_members is explicitly false with no other rights', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const channel = chats.newChannel();

        await bot.api.promoteChatMember(channel.id, target.id, { can_post_messages: true });

        expect(target.in(channel)?.status).toBe('administrator');

        await bot.api.promoteChatMember(channel.id, target.id, { can_restrict_members: false });

        expect(target.in(channel)?.status).toBe('member');
        expect(channel.moderation.demotions.length).toBe(1);
      });

      it('treats a promote call without any flags as a demotion', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.promote(target);
        await bot.api.promoteChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('member');
      });
    });

    describe('negative', () => {
      it('leaves a plain member untouched on demotion, but still logs it', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.promoteChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('member');
        expect(group.moderation.demotions.length).toBe(1);
      });

      it('logs but does not sync membership in a basic group (supergroup/channel-only method)', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newGroup();

        group.join(target);
        await bot.api.promoteChatMember(group.id, target.id, { can_delete_messages: true });

        expect(target.in(group)?.status).toBe('member');
        expect(group.moderation.promotions.length).toBe(1);
      });

      it('does not demote a restricted member to member', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.restrict(target, { can_send_messages: false });
        await bot.api.promoteChatMember(group.id, target.id);

        expect(target.in(group)?.status).toBe('restricted');
      });
    });
  });

  describe('ModerationLog views', () => {
    describe('positive', () => {
      it('separates kinds into bans / unbans / restrictions / promotions / demotions', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id);
        await bot.api.unbanChatMember(group.id, target.id);
        await bot.api.restrictChatMember(group.id, target.id, { can_send_messages: false });
        await bot.api.promoteChatMember(group.id, target.id, { can_pin_messages: true });
        await bot.api.promoteChatMember(group.id, target.id);

        expect(group.moderation.length).toBe(5);
        expect(group.moderation.bans.length).toBe(1);
        expect(group.moderation.unbans.length).toBe(1);
        expect(group.moderation.restrictions.length).toBe(1);
        expect(group.moderation.promotions.length).toBe(1);
        expect(group.moderation.demotions.length).toBe(1);
      });

      it('byUser narrows to the targeted user and preserves capture order', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const alice = chats.newUser();
        const eve = chats.newUser();
        const group = chats.newSupergroup();

        group.join(alice);
        group.join(eve);
        await bot.api.banChatMember(group.id, eve.id);
        await bot.api.banChatMember(group.id, alice.id);

        expect(group.moderation.bans.byUser(eve).length).toBe(1);
        expect(group.moderation.bans.byUser(eve).last?.userId).toBe(eve.id);
        expect(group.moderation.byUser(alice.id).all.map((action) => action.userId)).toEqual([alice.id]);
      });

      it('is cleared by chats.clear() while membership state is preserved', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);
        await bot.api.banChatMember(group.id, target.id);

        chats.clear();

        expect(group.moderation.length).toBe(0);
        expect(target.in(group)?.status).toBe('kicked');
      });

      it('keeps retained views live across later captures and chats.clear()', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const group = chats.newSupergroup();

        group.join(target);

        const { bans } = group.moderation;
        const targetBans = group.moderation.bans.byUser(target);

        expect(bans.length).toBe(0);

        await bot.api.banChatMember(group.id, target.id);

        expect(bans.length).toBe(1);
        expect(targetBans.last?.userId).toBe(target.id);

        chats.clear();

        expect(bans.length).toBe(0);
        expect(targetBans.length).toBe(0);
      });

      it('works on channels for ban and promote', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const target = chats.newUser();
        const channel = chats.newChannel();

        await bot.api.banChatMember(channel.id, target.id);

        expect(channel.moderation.bans.length).toBe(1);
        expect(target.in(channel)?.status).toBe('kicked');
      });
    });

    describe('negative', () => {
      it('lastOrThrow throws on an empty view', async () => {
        const bot = new Bot('test-token');
        const { chats } = await prepareBot(bot);
        const group = chats.newSupergroup();

        expect(() => group.moderation.bans.lastOrThrow()).toThrow('Expected a moderation action but the log is empty');
      });
    });
  });
});
