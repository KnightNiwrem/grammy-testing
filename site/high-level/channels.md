# Channel

`Channel` represents a Telegram broadcast channel. Use it to dispatch channel posts and
test bots that listen for `channel_post` or `edited_channel_post`.

```ts
const channel = chats.newChannel({ title: 'Announcements' });
```

## Properties

| Property   | Type                      | Description                       |
| ---------- | ------------------------- | --------------------------------- |
| `id`       | `number`                  | Negative channel ID               |
| `type`     | `'channel'`               | Chat type discriminant            |
| `title`    | `string`                  | Channel title                     |
| `messages` | `MessagesLog<TContext>`   | Bot messages sent to this channel |
| `members`  | `Map<userId, Membership>` | Membership state                  |

## Posting messages

### `post(text, options?)` → dispatches `channel_post`

Posts a text message in the channel itself, driving `bot.on('channel_post')` handlers.
The synthetic message matches real Bot API payloads: no `from` field, `sender_chat`
set to the channel itself, and an optional `author_signature` for channels with
"Sign messages" enabled.

```ts
const channel = chats.newChannel({ title: 'News' });

const post = await channel.post('Breaking news!', { author_signature: 'Editor' });

// post.sender_chat is the channel; post.from is absent
```

Options: `messageId` (override the auto-generated ID), `author_signature`, and
`reply_to_message` (reply to an earlier channel post; accepts a full `Message` or a
partial `{ message_id, ...rest }`).

To simulate Telegram auto-forwarding the post into a linked discussion group, compose
`post` with [`supergroup.postRelayMessage`](/high-level/groups) — each verb dispatches
exactly one update:

```ts
const post = await channel.post('Breaking news!');

await discussionGroup.postRelayMessage(post.text!, {
  channel,
  originMessageId: post.message_id,
  originDate: post.date,
});
```

`originMessageId` and `originDate` keep the original channel post's ID and timestamp in
`forward_origin`, matching real auto-forwards (the relay message gets its own local ID
and send time in the group).

### `postMessageTo(targetChat, text, options?)` → dispatches `message`

Posts a message as the channel identity into a group or supergroup, with
`sender_chat` set to the channel and `from` set to the synthetic `Channel_Bot` user
that real Telegram inserts on channel-posts-into-groups.

```ts
const group = chats.newSupergroup('Discussion');
const channel = chats.newChannel({ title: 'News' });

// Post from channel into the discussion group
await channel.postMessageTo(group, 'Breaking news!');
```

## Editing posts

### `editPost(messageId, newText, options?)` → dispatches `edited_channel_post`

Like real payloads, the edited post carries `sender_chat` set to the channel itself
and no `from` field. Pass `author_signature` to simulate a signed post.

```ts
const msg = await channel.post('Draft announcement');

await channel.editPost(msg.message_id, 'Final announcement');
```

## Membership events

### `changeMemberStatus(user, transition)` → `my_chat_member`

Dispatches a `my_chat_member` update for the channel (e.g. bot added/removed).

```ts
channel.changeMemberStatus(user, { old_status: 'left', new_status: 'member' });
```

## Reaction counts

### `dispatchReactionCount(messageId, reactions, options?)`

```ts
channel.dispatchReactionCount(msg.message_id, [{ type: 'emoji', emoji: '🔥', total_count: 100 }]);
```

## System messages

### `sendSystemMessage(text, options?)` (deprecated)

::: warning Deprecated
Real Telegram never delivers `message` updates with a channel-typed `chat` —
everything a channel emits arrives as `channel_post` or `edited_channel_post`.
Use [`post`](#posting-messages) instead. This verb is
kept for backwards compatibility and still dispatches the historical shape.
:::

```ts
await channel.sendSystemMessage('Channel created');
```

## Full cross-chat example

```ts
const { chats } = await prepareBot(createBot());
const channel = chats.newChannel({ title: 'News' });
const group = chats.newSupergroup('Discussion');

// Bot pins important channel posts and watches the discussion group

await channel.post('📌 New article published!');

await channel.postMessageTo(group, 'New article published!');
```
