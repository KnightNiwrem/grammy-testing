# Channel (API Reference)

```ts
class Channel<TContext extends Context = Context>
```

## Properties

| Property   | Type                                | Description                  |
| ---------- | ----------------------------------- | ---------------------------- |
| `id`       | `number`                            | Negative channel ID          |
| `type`     | `'channel'`                         | Chat type discriminant       |
| `title`    | `string`                            | Channel title                |
| `messages` | `MessagesLog<TContext>`             | Bot messages in this channel |
| `members`  | `Map<number, Membership<TContext>>` | Membership state             |

## Methods

| Method                  | Signature                                                                          | Description                                            |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `post`                  | `(text: string, options?: ChannelPostOptions) => Promise<Message>`                 | Dispatch `channel_post` in the channel itself          |
| `postMessageTo`         | `(chat: Group \| Supergroup, text: string, options?) => Promise<Message>`          | Post as channel into a group or supergroup (`message`) |
| `editPost`              | `(messageId: number, newText: string, options?: EditPostOptions) => Promise<void>` | Dispatch `edited_channel_post`                         |
| `changeMemberStatus`    | `(user: User<TContext>, transition: MemberStatusTransition) => Promise<void>`      | Dispatch `my_chat_member` for channel                  |
| `dispatchReactionCount` | `(messageId, reactions, options?) => Promise<void>`                                | Dispatch `message_reaction_count`                      |
| `sendSystemMessage`     | `(text: string, options?: SendSystemMessageOptions) => Promise<void>`              | System message (deprecated — use `post`)               |

## ChannelPostOptions

```ts
interface ChannelPostOptions {
  messageId?: number;
  author_signature?: string;
  reply_to_message?: Partial<Message> & { message_id: number };
}
```

## EditPostOptions

```ts
interface EditPostOptions {
  date?: number;
  author_signature?: string;
}
```

## See also

- [Channel guide](/high-level/channels)
