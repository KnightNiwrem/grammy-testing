import type { PrivateTextMessage } from './virtual_message.ts';

/** A canonical message was stored and numbered in its participants' message boxes. */
export interface MessageCreatedEvent {
  readonly type: 'message_created';
  readonly message: PrivateTextMessage;
}

/** A state change produced by a chat command, published in the order it happened. */
export type ChatDomainEvent = MessageCreatedEvent;
