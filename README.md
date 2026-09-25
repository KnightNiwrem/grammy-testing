# tg-bot-api-emulator

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
history. As on Telegram, a message sent with a reply keyboard, a forced reply, or a keyboard removal
cannot be edited. With `deleteWebhook` and `getMe` also implemented, a grammY bot can run with
`bot.start()` and stop with `bot.stop()`. Bots manage their command menus with `setMyCommands`,
`getMyCommands`, and `deleteMyCommands` for any scope and language, and a test reads the commands an
account's private chat shows, resolved by scope and language as Telegram documents. Bots can also
show chat actions such as typing with `sendChatAction`, which the emulator checks but does not keep.
As Telegram does in private chats with bots, the emulator marks bot commands such as `/start` with
`bot_command` entities, so framework command handlers match them; other entity types that Telegram
detects, such as URLs and mentions, are not detected yet, and date and time entities are not
supported.

Bots can receive updates through a webhook instead of `getUpdates`, as bots deployed with grammY's
`webhookCallback` do. After `setWebhook`, the emulator posts each update to the webhook URL as JSON,
with the `X-Telegram-Bot-Api-Secret-Token` header when the bot set a `secret_token`, and confirms
the update once the webhook answers with a 2xx status. As on Telegram, a failed update is sent again
at once and then after growing delays, `getWebhookInfo` reports the pending updates and the latest
failure, such as `Wrong response from the webhook: 500 Internal Server Error`, `getUpdates` fails
with `409 Conflict` while a webhook is set, and setting one ends the bot's waiting long poll. A
webhook that has not answered after 60 seconds fails with Telegram's `Read timeout expired`, though
Telegram times out only a webhook that sends nothing for that long. Unlike Telegram, the emulator
accepts plain HTTP URLs on any port, so a test can run the bot's webhook server on its own machine,
and it sends one update at a time, so a failing update holds back later ones, where Telegram sends
updates of different chats in parallel. It does not run a Bot API method that a webhook names in its
response, as Telegram does, and does not support `ip_address` or custom certificates. Ending a
session stops its webhooks.

Bots and accounts also exchange photos and documents with captions. A bot sends them with
`sendPhoto` and `sendDocument`, uploading a file as a multipart part, directly or through
`attach://`, or reusing one by its `file_id`; `editMessageCaption` edits a caption. As on Telegram,
each bot knows a file by its own `file_id`, and a bot downloads a file through the `file_path` that
`getFile` returns, under `<botApiRoot>/file/bot<token>/`. An account sends a photo or document as
base64 content, and a test reads any file of the session by its `file_unique_id`. The emulator reads
the dimensions of JPEG, PNG, GIF, WebP, and BMP photos, rejects other content with Telegram's
`IMAGE_PROCESS_FAILED` error, and keeps each photo in the one size and format it was sent in,
whereas Telegram converts photos to JPEG in several sizes. A document's MIME type follows its file
name's extension; unlike Telegram, the emulator never turns a video, audio file, or GIF sent as a
document into other media. Files sent by URL, thumbnails, and other media types, such as videos,
voice messages, and stickers, are not supported yet.

Bots forward and copy messages, as support and relay bots do, between the private chats and
supergroups they can reach. A bot forwards a message with `forwardMessage`: as TDLib does, the
forward repeats the content, shows who first sent it and when in `forward_origin` and the legacy
`forward_from` and `forward_date`, keeps the original's `via_bot`, and keeps an inline keyboard only
when every button opens a URL. A forward of a forward shows the original's origin, and a forward
cannot be edited. A bot copies a message with `copyMessage`, which answers only the copy's
`message_id`: the copy is the bot's own message, without an origin, with the reply and reply markup
of the request and, for a photo or document, an optional new caption. As on Telegram, a message
protected with `protect_content` cannot be forwarded, though a bot may copy it, and service messages
can be neither. An account forwards a message of one of its chats, too, and the bots of the chat it
goes to receive it with its `forward_origin`. Accounts never hide their name from forwards, so the
origin is always a user. `forwardMessages` and `copyMessages` are not supported yet.

Bots can run in inline mode, so tests can drive inline bots as users do. A bot created with
`supports_inline_queries` receives an `inline_query` update when an account types a query for it in
the account's private chat with a bot or in a supergroup, with Telegram's `chat_type`, and answers
with `answerInlineQuery`. The emulator checks answers in Telegram's order and fails them with its
errors, such as `RESULT_ID_DUPLICATE` and
`query is too old and response timeout expired or query ID
is invalid` for a query already answered.
A test reads the answer's results, and the account sends one to the chat where it typed the query,
as its own message with `via_bot`, even to a supergroup the bot is not a member of. The chat's bots
receive that message like any other account message, and a bot in privacy mode receives the messages
sent through it. With `receives_chosen_inline_results`, which turns on BotFather's inline feedback,
the inline bot also receives a `chosen_inline_result` update. As on Telegram, the bot knows a
message sent through it with an inline keyboard by its `inline_message_id`: presses of its callback
buttons reach the inline bot as callback queries without the message, and the bot edits it with
`editMessageText`, `editMessageCaption`, and `editMessageReplyMarkup`, which answer `true`. As in
TDLib, an inline bot that can reach the message's chat also edits the message by its `chat_id` and
`message_id`, and no other bot edits it. Results can be articles, which send text, and photos and
documents the bot knows by `file_id`; other result types, results sending locations, contacts, or
invoices, files given by URL, and user locations are not supported. The emulator does not expire
inline queries or cache answers, and a test reads the button above the results but cannot press it.

Bot API requests follow Telegram's conventions: GET or POST, case-insensitive method names, and
parameters in the query string or a JSON, URL-encoded, or multipart body. Bot API failures,
including calls to methods the emulator does not implement, return Telegram-shaped JSON errors that
clients report as API errors. The session creation response identifies its Bot API root. Other
routes described in `openapi.yaml` are not implemented yet.

Bots can also take part in supergroups. An account creates a supergroup and adds accounts and bots
to it, and each added bot receives a `my_chat_member` update. The Bot API methods above accept a
supergroup's negative chat ID, and replies, inline keyboards, callback buttons, and account edits
work as in private chats. A supergroup numbers its messages once, so every member sees the same
message IDs. As on Telegram, bots never receive other bots' messages, apart from service messages,
and a bot in privacy mode, the default, receives only account messages addressed to it: replies to
its messages or to messages meant for it, messages sent through it, commands naming it, and mentions
of it and commands without a bot's username in messages meant for no bot in particular. As on
Telegram, a message reaches only one bot in privacy mode, and replies take precedence, so a reply to
bot A's message that commands bot B reaches only A. Telegram delivers a command without a bot's
username only to the bot that last wrote to the group; the emulator delivers it to every bot in
privacy mode. A bot created with `can_read_all_group_messages` receives every account message. In a
supergroup, a bot edits only its own messages and those sent through it, and deletes only its own
unless it is an administrator.

Members join and leave supergroups as on Telegram, so tests can drive welcome and moderation bots.
Each addition, departure, and removal is a service message in the supergroup's history, with
`new_chat_members` or `left_chat_member` and Telegram's legacy fields, and every bot of the
supergroup receives it, even in privacy mode. An account leaves a supergroup, and the owner removes
accounts and bots, which bans them until the owner adds them again. A removed bot receives a
`my_chat_member` update showing it as `kicked` and the service message about its removal, and its
later requests to the supergroup fail with Telegram's
`403 Forbidden: bot was kicked from the
supergroup chat`. A bot leaves with `leaveChat`, after which
its requests fail with `403 Forbidden:
bot is not a member of the supergroup chat`. The owner cannot
leave its supergroup, whereas Telegram lets a creator leave and stay the owner.

Owners promote members to administrators, so tests can drive moderation bots. The owner grants an
account or a bot administrator rights by their Bot API names, changes them, and demotes it again,
and a promoted or demoted bot receives a `my_chat_member` update showing its new standing. As on
Telegram, an administrator bot receives every message of the supergroup, privacy mode
notwithstanding. With `can_delete_messages` it deletes any message there, service messages included,
and with `can_restrict_members` it bans users with `banChatMember`, which removes a member with a
service message of the bot, and lifts bans with `unbanChatMember`, which, as on Telegram, also
removes a member unless `only_if_banned` is set. The emulator checks these requests in TDLib's order
and fails them with Telegram's errors, such as `can't remove chat owner` and
`not enough rights to restrict/unrestrict chat member`. Bots read users' standings with
`getChatMember`, `getChatAdministrators`, and `getChatMemberCount`, and, as on Telegram, an
administrator bot that requests `chat_member` in `allowed_updates` receives a `chat_member` update
for each addition, departure, removal, promotion, demotion, ban, and unban of another user. Bots see
the other rights, but the emulator does not enforce them, and bots cannot promote members. A ban
lasts until it is lifted, even when its `until_date` passes. Restricting members with
`restrictChatMember`, anonymous administrators, and custom titles are not supported yet, nor are
reply keyboards and forced replies in groups, members joining on their own, chat scopes of command
lists for supergroups, basic groups, and channels.

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
    supports_inline_queries: true,
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

  // Send the bot a photo, then read the bytes of the file the bot's reply carries, if any.
  const photo = await account.sendPhoto({
    to: { type: 'private', botId: bot.id },
    photo: await Deno.readFile('receipt.png'),
    caption: 'My receipt',
  });
  const reply = (await account.getMessages({ chat: { type: 'private', botId: bot.id } })).at(-1);
  const replyFile = reply?.document ?? reply?.photo?.at(-1);
  if (replyFile !== undefined) {
    const content = await session.downloadFile(replyFile.file_unique_id);
    console.log(content.length, photo.photo?.[0].width);
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

  // Create a supergroup, add the bot, and send it a command there. The bot receives a
  // my_chat_member update and a new_chat_members service message when it is added, and, in privacy
  // mode, only messages addressed to it.
  const supergroup = await account.createSupergroup({ title: 'Team' });
  const groupChat = { type: 'supergroup', chatId: supergroup.id } as const;
  await account.addChatMember({ chat: groupChat, userId: bot.id });
  const groupCommand = await account.sendMessage({ to: groupChat, text: '/start@test_bot' });
  const groupHistory = await account.getMessages({ chat: groupChat });
  console.log(groupHistory.map(({ from, text }) => `${from.first_name}: ${text ?? '(service)'}`));

  // Forward the command to the bot's private chat. The bot receives it with its forward_origin.
  const forwardedCommand = await account.forwardMessage({
    from: groupChat,
    message_id: groupCommand.message_id,
    to: { type: 'private', botId: bot.id },
  });
  console.log(forwardedCommand.forward_origin?.sender_user.first_name);

  // Type an inline query for the bot in the supergroup, read the bot's answer once it has
  // answered, and send a result, which appears in the supergroup with via_bot.
  const inlineQuery = await account.sendInlineQuery({
    bot_id: bot.id,
    chat: groupChat,
    query: 'cats',
  });
  const answeredQuery = await account.getInlineQuery(inlineQuery.id);
  const firstResult = answeredQuery.answer?.results[0];
  if (firstResult !== undefined) {
    await account.chooseInlineQueryResult({
      inline_query_id: inlineQuery.id,
      result_id: firstResult.id,
    });
  }

  // Promote the bot to administrator. It then receives every message of the supergroup, deletes
  // any, and bans spammers with banChatMember; demoting it takes its rights away again.
  await account.promoteChatMember({
    chat: groupChat,
    userId: bot.id,
    rights: { can_delete_messages: true, can_restrict_members: true },
  });
  await account.demoteChatMember({ chat: groupChat, userId: bot.id });

  // Remove the bot, which bans it: it receives a my_chat_member update showing it as kicked, and
  // its requests to the supergroup fail with 403 until the owner adds it again.
  await account.removeChatMember({ chat: groupChat, userId: bot.id });
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
- `deno task architecture:check` — check that imports respect the layer boundaries set in
  `.fallowrc.json`

## Environment

- `DOMAIN` — domain advertised to clients; defaults to `localhost`
- `PORT` — listening and advertised port; defaults to `8081`

## License

The project is almost entirely AI-generated. [COPYRIGHT.md](COPYRIGHT.md) records its provenance and
dedicates any rights the maintainer holds under [CC0 1.0 Universal](LICENSE).
