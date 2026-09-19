/**
 * Example 4 — groups: joining, greeting, privacy mode, and moderation.
 *
 * What this example establishes about the library:
 *
 * - A group is created with an owner and grows by actions (`joinGroup`, `addToGroup`), not by a
 *   member list frozen at creation. Membership changes are events the bot observes, so they must
 *   be actions that synthesize updates.
 * - Roles exist from the start: the owner promotes, an administrator moderates. Promotion rights
 *   are per-capability, matching `promoteChatMember`.
 * - Update delivery is membership- and privacy-aware. A bot in a group with default privacy mode
 *   receives commands and service messages but not plain member chatter; promoting it to
 *   administrator makes it receive everything. Delivery rules are therefore per-recipient
 *   filtering at update-synthesis time, not a property of the message.
 * - Moderation closes the loop through introspection: the bot bans via the real Bot API, and the
 *   test observes the resulting member status through the admin surface (`waitForMemberStatus`),
 *   not by parsing chat messages.
 */
import { assert, assertEquals } from '@std/assert';
import { Bot } from 'grammy';
import { connect, startBot } from './grammy_testing.ts';

Deno.test('bot greets a joining member and bans a spammer once promoted', async () => {
  const emulator = connect({ serverUrl: 'http://localhost:8081' });
  await using session = await emulator.createSession();

  const account = await session.createBot({ username: 'moderator_bot' });
  const bot = new Bot(account.token, { client: { apiRoot: session.apiRoot } });
  bot.on('message:new_chat_members', async (ctx) => {
    const names = ctx.message.new_chat_members.map((member) => member.first_name);
    await ctx.reply(`Welcome ${names.join(', ')}!`);
  });
  bot.hears(/spam/i, async (ctx) => {
    const sender = ctx.from;
    if (sender !== undefined) await ctx.banChatMember(sender.id);
  });
  await using _running = await startBot(bot);

  const alice = await session.createUser({ firstName: 'Alice' });
  const bob = await session.createUser({ firstName: 'Bob' });
  const group = await session.createGroup({ title: 'Chess Club', owner: alice });

  // The bot only sees the group once a member brings it in; the service message is the anchor.
  await alice.addToGroup(group, account);

  const bobJoined = await bob.joinGroup(group);
  const greeting = await group.waitForMessage({ from: account, after: bobJoined });
  assert(greeting.text?.includes('Bob'));

  // With default privacy mode the bot would never see Bob's plain-text message below, so the
  // `hears` handler could not fire. Administrators receive all group messages.
  await alice.promote(group, account, { canRestrictMembers: true, canDeleteMessages: true });

  await bob.sendText(group, 'buy spam coins now');
  const bobAfterBan = await group.waitForMemberStatus({ member: bob, status: 'kicked' });
  assertEquals(bobAfterBan.status, 'kicked');

  // The owner is untouched; member state is queryable without waiting.
  const aliceMember = await group.getMember(alice);
  assertEquals(aliceMember.status, 'creator');
});
