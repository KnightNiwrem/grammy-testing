# Reply (API Reference)

```ts
class Reply<TContext extends Context = Context>
```

## Properties

| Property      | Type                           | Description                                           |
| ------------- | ------------------------------ | ----------------------------------------------------- |
| `text`        | `string \| undefined`          | Message text                                          |
| `parseMode`   | `ParseMode \| undefined`       | Parse mode used                                       |
| `entities`    | `MessageEntity[] \| undefined` | Text entities                                         |
| `buttons`     | `ReplyButton[]`                | Inline keyboard buttons (empty if no keyboard)        |
| `invoice`     | `Invoice \| undefined`         | Public `sendInvoice` fields (private payload omitted) |
| `replyMarkup` | `unknown`                      | Raw `reply_markup` from the payload                   |
| `chat`        | `AnyChat<TContext>`            | Target chat                                           |
| `messageId`   | `number`                       | Synthetic message ID                                  |
| `raw`         | `Record<string, unknown>`      | Full outgoing Bot API payload                         |
| `replyingTo`  | `Reply<TContext> \| undefined` | Referenced earlier reply (if any)                     |
| `media`       | `ReplyMedia \| undefined`      | Media type and file ID (if media message)             |

## Methods

### `clickButton(matcher, options?): Promise<CallbackQueryHandle>`

Dispatches a callback query as if the user clicked the button. The returned handle
exposes the bot's strictly correlated `answerCallbackQuery` call through a live
`answer` getter.

```ts
// By visible text:
const click = await reply.clickButton('Yes');

expect(click.answer?.text).toBe('Thanks!');

// By callback data:
await reply.clickButton({ callbackData: 'answer:yes' });

// Group, supergroup, and channel clicks require the user identity:
await groupReply.clickButton('Yes', { by: alice });
```

## ReplyButton

```ts
interface ReplyButton {
  text: string;
  callbackData?: string;
  url?: string;
  raw: InlineKeyboardButton;
}
```

## ReplyMedia

```ts
type MediaType = 'animation' | 'audio' | 'document' | 'photo' | 'sticker' | 'video' | 'video_note' | 'voice';

interface ReplyMedia {
  type: MediaType;
  fileId: string;
}
```

## ReplyClickButtonMatcher

```ts
interface ReplyClickButtonMatcher {
  callbackData: string;
}

interface ReplyClickButtonOptions<TContext extends Context = Context> {
  by?: User<TContext>;
}
```

`clickButton` accepts either a `string` (matched against button text) or a
`ReplyClickButtonMatcher` (matched against `callbackData`). `options.by` is
inferred in private chats and required elsewhere.

## CallbackQueryHandle

```ts
class CallbackQueryHandle {
  readonly id: string;
  readonly callbackData: string;
  readonly answer: CallbackQueryAnswer | undefined;
}

interface CallbackQueryAnswer {
  callbackQueryId: string;
  text: string | undefined;
  showAlert: boolean | undefined;
  url: string | undefined;
  cacheTime: number | undefined;
  raw: Record<string, unknown>;
}
```

`answer` remains `undefined` when the bot does not answer. It is a live getter,
so it can be read again after `await chats.idle()` for a fire-and-forget API call.

## See also

- [Reply guide](/high-level/reply)
