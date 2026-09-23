import type { BotApiBotUser, BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { VirtualAccountProfile } from '../types/virtual_account.ts';
import type { VirtualBotProfile } from '../types/virtual_bot.ts';
import type { PrivateTextMessage } from '../types/virtual_message.ts';

export interface PrivateTextMessageForBotProjectionInput {
  readonly message: PrivateTextMessage;
  /** The conversation's account, which is the observing bot's private-chat peer. */
  readonly account: VirtualAccountProfile;
  /** The conversation's bot, which observes the message. */
  readonly bot: VirtualBotProfile;
  /** The message's ID in the observing bot's message box. */
  readonly observerMessageId: number;
}

/**
 * Projects a canonical private text message as seen by the bot of its conversation.
 *
 * The chat is always the account, whoever wrote the message; the sender follows the author.
 */
export function projectPrivateTextMessageForBot(
  { message, account, bot, observerMessageId }: PrivateTextMessageForBotProjectionInput,
): BotApiPrivateTextMessage {
  const { id, first_name, last_name, username } = account;
  return {
    message_id: observerMessageId,
    from: message.authorRole === 'account' ? account : projectBotAsMessageSender(bot),
    chat: {
      id,
      type: 'private',
      first_name,
      ...(last_name === undefined ? {} : { last_name }),
      ...(username === undefined ? {} : { username }),
    },
    date: message.sentAtUnixSeconds,
    text: message.text,
    ...(message.entities.length === 0 ? {} : {
      entities: message.entities.map(({ type, offset, length }) => ({ type, offset, length })),
    }),
  };
}

function projectBotAsMessageSender(bot: VirtualBotProfile): BotApiBotUser {
  const { id, first_name, last_name, username } = bot;
  return {
    id,
    is_bot: true,
    first_name,
    ...(last_name === undefined ? {} : { last_name }),
    username,
  };
}
