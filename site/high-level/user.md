# User

`User` is the primary actor for dispatching synthetic updates. Every method sends a Telegram
update to your bot and returns the resulting `Message` object.

```ts
const user = chats.newUser({ first_name: 'Alice' });
```

## UserSendOptions

The message-send verbs `sendText`, `sendCommand`, `sendPhoto`, `sendDocument`, `sendVideo`,
`sendAudio`, `sendVoice`, `sendVideoNote`, `sendAnimation`, `sendSticker`, `sendLocation`,
`sendContact`, `sendVenue`, `sendPoll`, `sendDice`, and `sendMediaGroup` (shared options)
accept the same shared options. (`sendForwarded`, `sendWebAppData`, and
`sendSuccessfulPayment` keep their narrower `{ chat }` options.)

```ts
interface UserSendOptions {
  chat?: Group | Supergroup | Channel | PrivateChat; // target chat (default: user's private chat)
  reply_to_message?: Partial<Message> & { message_id: number };
  reply_parameters?: { message_id: number };
  anonymous?: boolean; // send as GROUP_ANONYMOUS_BOT (requires chat: group/supergroup)
  topic?: ForumTopic; // target forum topic minted via forum.newTopic(...)
}
```

`sendText` additionally accepts text-specific fields:

```ts
interface SendTextOptions extends UserSendOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  entities?: MessageEntity[];
}
```

So "a user posts a photo into the Billing topic" or "a user replies to a message with a
document" needs no hand-built raw payloads:

```ts
const forum = chats.newSupergroup({ title: 'Support', isForum: true });
const billing = forum.newTopic({ name: 'Billing' });

await user.sendPhoto(undefined, { topic: billing, caption: 'invoice screenshot' });
await user.sendDocument(undefined, { chat: group, reply_to_message: { message_id: 7 } });
await user.sendDice('🎲', { chat: group, anonymous: true });
```

## Text & Commands

### `sendText(text, options?)`

Sends a plain text message.

```ts
await user.sendText('Hello!');
await user.sendText('Hi there', { chat: group, parse_mode: 'HTML' });
```

### `sendMessage(text, options?)`

Alias for `sendText`.

### `sendCommand(command, args?, options?)`

Sends a text message that looks like a bot command (with a `bot_command` entity).

```ts
await user.sendCommand('/start');
await user.sendCommand('/set', 'dark'); // → /set dark
await user.sendCommand('/ban', '42', { chat: group });
```

## Media

### `sendPhoto(fileId?, options?)`

```ts
await user.sendPhoto('AgACAgI...', { caption: 'Look!' });
```

### `sendDocument(options?)`

```ts
await user.sendDocument({ caption: 'report.pdf' });
```

### `sendVideo(options?)` / `sendAudio(options?)` / `sendVoice(options?)` / `sendVideoNote(options?)`

```ts
await user.sendVideo();
await user.sendAudio({ duration: 120 });
```

### `sendAnimation(options?)` / `sendSticker(fileId?, options?)`

```ts
await user.sendSticker('CAACAgI...');
```

### `sendMediaGroup(items)`

Sends an album of multiple media items. Returns `Message[]`.

```ts
const messages = await user.sendMediaGroup([
  { type: 'photo', media: 'AgACAgI...' },
  { type: 'video', media: 'BAACAgI...' },
]);
```

## Special content

### `sendLocation(options?)` / `sendContact(options?)` / `sendVenue(options?)`

```ts
await user.sendLocation({ latitude: 50.4, longitude: 30.5 });
await user.sendContact({ phone_number: '+380001234567', first_name: 'Alice' });
```

### `sendPoll(question, options?, sendOptions?)`

```ts
await user.sendPoll('Which?', { options: ['A', 'B', 'C'] });
```

### `sendDice(options?)`

```ts
const msg = await user.sendDice({ emoji: '🎲' });
```

### `sendWebAppData(data, buttonText, options?)`

```ts
await user.sendWebAppData('{"result":42}', 'Submit');
```

## Group & service events

### `joinChat(chat, options?)` → dispatches `new_chat_members`

```ts
await user.joinChat(group);
```

### `leaveChat(chat, options?)` → dispatches `left_chat_member`

```ts
await user.leaveChat(group);
```

## Inline & callback

### `sendInlineQuery(query, options?)`

```ts
await user.sendInlineQuery('search term');
```

### `chooseInlineResult(resultId, options?)`

```ts
await user.chooseInlineResult('result_001');
```

### `sendCallbackQuery(data, options?)`

Sends a standalone callback query (not associated with a button click). For button clicks,
use `reply.clickButton()`.

```ts
await user.sendCallbackQuery('my_action');
```

## Reactions & polls

### `reactTo(reply, reaction)` → dispatches `message_reaction`

```ts
await user.reactTo(lastReply, { type: 'emoji', emoji: '👍' });
```

### `answerPoll(reply, optionIndices)` → dispatches `poll_answer`

```ts
await user.answerPoll(pollReply, [0, 2]);
```

## Payment

### `sendSuccessfulPayment(options?)`

```ts
await user.sendSuccessfulPayment({ total_amount: 1000, currency: 'USD' });
```

### `sendShippingQuery(options?)` / `sendPreCheckoutQuery(options?)`

```ts
await user.sendShippingQuery({ invoice_payload: 'order_42' });
```

### `purchasePaidMedia(payload, options?)`

```ts
await user.purchasePaidMedia('media_payload');
```

## Bot & chat management

### `boostChat(chat)` → dispatches `chat_boost`

```ts
await user.boostChat(channel);
```

### `removeBoost(chat, boostId)` → dispatches `removed_chat_boost`

```ts
await user.removeBoost(channel, 'boost_001');
```

### `requestJoin(group)` → dispatches `chat_join_request`

```ts
await user.requestJoin(group);
```

### `manageBot(botUser, options?)` → dispatches Business managed bot update

```ts
await user.manageBot(chats.newUser({ is_bot: true }));
```

## Sending to a specific chat

Pass `{ chat }` to send to a group, supergroup, or channel:

```ts
const group = chats.newSupergroup('Dev Chat');
group.join(user);

await user.sendText('/help', { chat: group });
expect(group.messages.lastOrThrow?.text).toBe(...);
```

## Anonymous group messages

```ts
await user.sendText('/vote yes', { chat: group, anonymous: true });
// ctx.message.from === GROUP_ANONYMOUS_BOT
```

## Reply to a message

```ts
const originalMsg = await user.sendText('Original');

await user.sendText('Reply!', {
  chat: group,
  reply_to_message: { message_id: originalMsg.message_id },
});
```
