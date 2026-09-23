import type { BotApiPrivateTextMessage } from '../types/bot_api.ts';
import type { VirtualAccountProfile } from '../types/virtual_account.ts';
import type { PrivateTextMessage } from '../types/virtual_message.ts';

export interface PrivateTextMessageProjectionInput {
  readonly message: PrivateTextMessage;
  readonly author: VirtualAccountProfile;
  /** The message's ID in the observing bot's message box. */
  readonly observerMessageId: number;
}

/** Projects a canonical private text message as seen by the bot in its conversation. */
export function projectPrivateTextMessage(
  { message, author, observerMessageId }: PrivateTextMessageProjectionInput,
): BotApiPrivateTextMessage {
  const { id, first_name, last_name, username } = author;
  return {
    message_id: observerMessageId,
    from: author,
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
