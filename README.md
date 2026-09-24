# grammY Testing

An HTTP server for emulating the Telegram Bot API in end-to-end tests. The server will expose both
the emulated Bot API and an admin API for controlling isolated test sessions.

The standalone server currently supports creating and ending isolated test sessions, adding virtual
bots and accounts, sending private text messages as an account, inspecting private conversation
history, and receiving account messages through the Bot API `getUpdates` method, which honors its
`allowed_updates` subscription. As on Telegram, a bot has at most one waiting long poll: a newer one
ends the earlier request with a `409 Conflict`, so tests notice when two bot instances poll at once.
Ending a session answers its bots' waiting long polls at once, without updates. Bots reply with the
Bot API `sendMessage` method, which sends text to an account that has written to the bot, optionally
as a reply to a message of the chat, protected with `protect_content`, and with an inline keyboard
of callback and URL buttons, a reply keyboard of text buttons, a keyboard removal, or a forced
reply. A test reads the reply keyboard or forced reply the account's client shows, which follows
Telegram's rules for replacing and removing it, and presses a reply keyboard button to send its
text. Link preview options and `disable_notification` are accepted and have no effect. Accounts can
reply to messages too, and a reply shows the replied message as `reply_to_message`, as on Telegram.
An account can edit the text of its messages, which sends the bot an `edited_message` update. It can
also block a bot and unblock it, which sends the bot a `my_chat_member` update each time. While the
account blocks the bot, the account cannot write to it, and the bot's messages and chat actions to
the account fail with error 403, `Forbidden: bot was blocked by the user`. Text can be formatted
with `parse_mode` (`HTML`, `MarkdownV2`, or legacy `Markdown`) or with `entities`, which the
emulator reads, validates, and normalizes with Telegram's own rules and error messages, so a test
catches markup that Telegram would reject, such as an unescaped `.` in MarkdownV2. As on Telegram,
message text from either side is trimmed and cleaned of control characters. Bot messages appear in
conversation history, and, as on Telegram, the bot receives no update for its own messages or edits.
An account can press a callback button, which sends the bot a `callback_query` update; the bot
answers with `answerCallbackQuery`, and the test reads the answer from the pressed callback query. A
press can create the callback query already expired, to check how a bot handles a query it can no
longer answer, such as one that arrives after downtime. Bots edit their messages with
`editMessageText` and `editMessageReplyMarkup`, and delete messages that either side wrote in their
private chats with `deleteMessage` and `deleteMessages`; deleted messages leave the conversation
history. With `deleteWebhook` and `getMe` also implemented, a grammY bot can run with `bot.start()`
and stop with `bot.stop()`. Bots manage their command menus with `setMyCommands`, `getMyCommands`,
and `deleteMyCommands` for any scope and language, and a test reads the commands an account's
private chat shows, resolved by scope and language as Telegram documents. Bots can also show chat
actions such as typing with `sendChatAction`, which the emulator checks but does not keep. As
Telegram does in private chats with bots, the emulator marks bot commands such as `/start` with
`bot_command` entities, so framework command handlers match them; other entity types that Telegram
detects, such as URLs and mentions, are not detected yet, and date and time entities are not
supported. Bot API requests follow Telegram's conventions: GET or POST, case-insensitive method
names, and parameters in the query string or a JSON, URL-encoded, or multipart body. Bot API
failures, including calls to methods the emulator does not implement, return Telegram-shaped JSON
errors that clients report as API errors. The session creation response identifies its Bot API root.
Other routes described in `openapi.yaml` are not implemented yet.

## TypeScript client

Tests can use the TypeScript client instead of constructing emulation server URLs directly:

```ts
import { TelegramEmulationClient } from './clients/typescript/mod.ts';

const emulator = new TelegramEmulationClient('http://localhost:8081');
const session = await emulator.createSession();

try {
  const { token, bot } = await session.createBot({
    first_name: 'Test Bot',
    username: 'test_bot',
  });
  const { account } = await session.createAccount({ first_name: 'Ada' });

  const incomingMessage = await account.sendMessage({
    to: { type: 'private', botId: bot.id },
    text: 'Hello!',
  });

  // Run a grammY bot with token and session.botApiRoot as its apiRoot. Its polling
  // receives the message above, and its replies appear in the stored history.
  const history = await account.getMessages({
    chat: { type: 'private', botId: bot.id },
  });

  // Press a callback button on the bot's latest reply, then read the bot's answer.
  const menu = history.at(-1);
  if (menu?.reply_markup !== undefined) {
    const callbackQuery = await account.pressCallbackButton({
      chat: { type: 'private', botId: bot.id },
      message_id: menu.message_id,
      callback_data: 'yes',
    });
    const { answer } = await account.getCallbackQuery(callbackQuery.id);
    console.log(answer?.text);
  }

  // Press a button of the reply keyboard the account's client shows, which sends its text.
  const replyInterface = await account.getReplyInterface({
    chat: { type: 'private', botId: bot.id },
  });
  if (replyInterface?.type === 'keyboard') {
    await account.pressReplyKeyboardButton({
      chat: { type: 'private', botId: bot.id },
      text: replyInterface.keyboard[0][0].text,
    });
  }

  // Edit the account's first message, which sends the bot an edited_message update.
  await account.editMessage({
    chat: { type: 'private', botId: bot.id },
    message_id: incomingMessage.message_id,
    text: 'Hello again!',
  });

  // Block the bot. It receives a my_chat_member update, and its messages to the account fail
  // with 403 until the account unblocks it.
  await account.blockBot({ botId: bot.id });
  await account.unblockBot({ botId: bot.id });

  // Read the command menu the account sees in its chat with the bot.
  const commands = await account.getBotCommands({ chat: { type: 'private', botId: bot.id } });
  console.log(commands.map(({ command }) => `/${command}`));
  console.log(token, session.botApiRoot, incomingMessage, history);
} finally {
  await session.end();
}
```

## Commands

- `deno task start` — start the server using the environment described below
- `deno task dev` — start the server with file watching
- `deno task test` — run tests
- `deno task lint` — lint files
- `deno task fmt` — format files
- `deno task fmt:check` — check formatting
- `deno task check` — type-check source and test files
- `deno task openapi:lint` — lint `openapi.yaml` with Redocly's recommended rules

## Environment

- `DOMAIN` — domain advertised to clients; defaults to `localhost`
- `PORT` — listening and advertised port; defaults to `8081`
