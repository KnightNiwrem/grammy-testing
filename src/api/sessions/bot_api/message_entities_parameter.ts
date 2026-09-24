import { z } from 'zod';

import type { PlainTextEntityType, TextEntity } from '../../../types/virtual_message.ts';
import { jsonParameter } from './request_parameters.ts';

/** Telegram's date and time entities, which the emulator does not support. */
export const DATE_TIME_UNSUPPORTED_DESCRIPTION =
  'Bad Request: date_time entities are not supported';

export type MessageEntitiesParameterReading =
  | { readonly read: true; readonly entities: readonly TextEntity[] }
  | { readonly read: false; readonly description: string };

/**
 * Entity types that Telegram detects in text by itself; it ignores them when a sender specifies
 * them, so entities copied from a received message can be sent back as they are.
 */
const DETECTED_ENTITY_TYPES = [
  'mention',
  'hashtag',
  'cashtag',
  'bot_command',
  'url',
  'email',
  'phone_number',
  'bank_card_number',
] as const;

const SPECIFIABLE_PLAIN_ENTITY_TYPES = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
  'code',
  'blockquote',
  'expandable_blockquote',
] as const satisfies readonly PlainTextEntityType[];

const entitySpanShape = { offset: z.int(), length: z.int() };

const detectedEntitySchema = z.strictObject({
  type: z.enum(DETECTED_ENTITY_TYPES),
  ...entitySpanShape,
});
const plainEntitySchema = z.strictObject({
  type: z.enum(SPECIFIABLE_PLAIN_ENTITY_TYPES),
  ...entitySpanShape,
});
const preEntitySchema = z.strictObject({
  type: z.literal('pre'),
  ...entitySpanShape,
  language: z.string().optional(),
});
const textLinkEntitySchema = z.strictObject({
  type: z.literal('text_link'),
  ...entitySpanShape,
  url: z.string(),
});
// Telegram reads only the mentioned user's ID, so a full user object from a received message is
// accepted as it is.
const textMentionEntitySchema = z.strictObject({
  type: z.literal('text_mention'),
  ...entitySpanShape,
  user: z.looseObject({ id: z.int() }),
});
const customEmojiEntitySchema = z.strictObject({
  type: z.literal('custom_emoji'),
  ...entitySpanShape,
  custom_emoji_id: z.string(),
});

/** An `entities` parameter: a JSON array whose elements `readMessageEntitiesParameter` reads. */
export function messageEntitiesParameter() {
  return jsonParameter(z.array(z.unknown()));
}

/**
 * Reads the elements of an `entities` parameter as the official Bot API server's
 * `get_text_entity` does, failing with Telegram's description for an unsupported type.
 *
 * `invalidParametersDescription` answers entities that Telegram would read leniently, such as
 * numbers written as strings, which are rejected instead to surface the bot's mistake in tests.
 */
export function readMessageEntitiesParameter(
  entityValues: readonly unknown[],
  invalidParametersDescription: string,
): MessageEntitiesParameterReading {
  const entities: TextEntity[] = [];
  for (const entityValue of entityValues) {
    const reading = readMessageEntity(entityValue);
    switch (reading.kind) {
      case 'entity':
        entities.push(reading.entity);
        break;
      case 'ignored':
        break;
      case 'unsupported_type':
        return {
          read: false,
          description: `Bad Request: can't parse MessageEntity: ${reading.error}`,
        };
      case 'date_time':
        return { read: false, description: DATE_TIME_UNSUPPORTED_DESCRIPTION };
      case 'malformed':
        return { read: false, description: invalidParametersDescription };
      default: {
        const unhandledReading: never = reading;
        throw new Error(`Unhandled entity reading: ${JSON.stringify(unhandledReading)}`);
      }
    }
  }
  return { read: true, entities };
}

type MessageEntityReading =
  | { readonly kind: 'entity'; readonly entity: TextEntity }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'unsupported_type'; readonly error: string }
  | { readonly kind: 'date_time' }
  | { readonly kind: 'malformed' };

/** Reads one Bot API `MessageEntity` object, as the Bot API server's `get_text_entity` does. */
function readMessageEntity(value: unknown): MessageEntityReading {
  const typeReading = z.looseObject({ type: z.string() }).safeParse(value);
  if (!typeReading.success) {
    return { kind: 'malformed' };
  }
  const { type } = typeReading.data;
  if (type.length === 0) {
    return { kind: 'unsupported_type', error: 'Type is not specified' };
  }

  if (isOneOf(type, DETECTED_ENTITY_TYPES)) {
    return detectedEntitySchema.safeParse(value).success
      ? { kind: 'ignored' }
      : { kind: 'malformed' };
  }
  if (isOneOf(type, SPECIFIABLE_PLAIN_ENTITY_TYPES)) {
    const entity = plainEntitySchema.safeParse(value);
    return entity.success ? { kind: 'entity', entity: entity.data } : { kind: 'malformed' };
  }
  switch (type) {
    case 'pre': {
      const entity = preEntitySchema.safeParse(value);
      if (!entity.success) {
        return { kind: 'malformed' };
      }
      const { offset, length, language } = entity.data;
      // Telegram reads an empty language as none.
      return {
        kind: 'entity',
        entity: language === undefined || language.length === 0
          ? { type, offset, length }
          : { type, offset, length, language },
      };
    }
    case 'text_link': {
      const entity = textLinkEntitySchema.safeParse(value);
      return entity.success ? { kind: 'entity', entity: entity.data } : { kind: 'malformed' };
    }
    case 'text_mention': {
      const entity = textMentionEntitySchema.safeParse(value);
      if (!entity.success) {
        return { kind: 'malformed' };
      }
      const { offset, length, user } = entity.data;
      return { kind: 'entity', entity: { type, offset, length, userId: user.id } };
    }
    case 'custom_emoji': {
      const entity = customEmojiEntitySchema.safeParse(value);
      if (!entity.success) {
        return { kind: 'malformed' };
      }
      const { offset, length, custom_emoji_id } = entity.data;
      return {
        kind: 'entity',
        entity: { type, offset, length, customEmojiId: custom_emoji_id },
      };
    }
    case 'date_time':
      return { kind: 'date_time' };
    default:
      return { kind: 'unsupported_type', error: 'Unsupported type specified' };
  }
}

function isOneOf<Value extends string>(value: string, values: readonly Value[]): value is Value {
  return (values as readonly string[]).includes(value);
}
