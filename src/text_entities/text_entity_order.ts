import type { TextEntity } from '../types/virtual_message.ts';

/**
 * TDLib's ordering priority of each entity type, from `MessageEntity::get_type_priority` in
 * `td/telegram/MessageEntity.cpp`. Among entities that share a span, a lower priority comes first,
 * so it encloses the others.
 */
function getTypePriority(entity: TextEntity): number {
  switch (entity.type) {
    case 'blockquote':
    case 'expandable_blockquote':
      return 0;
    case 'pre':
      return entity.language === undefined ? 11 : 10;
    case 'code':
      return 20;
    case 'date_time':
      return 30;
    case 'text_link':
    case 'text_mention':
      return 49;
    case 'mention':
    case 'hashtag':
    case 'cashtag':
    case 'bot_command':
    case 'url':
    case 'email':
    case 'bank_card_number':
      return 50;
    case 'bold':
      return 90;
    case 'italic':
      return 91;
    case 'underline':
      return 92;
    case 'strikethrough':
      return 93;
    case 'spoiler':
      return 94;
    case 'custom_emoji':
      return 99;
    default: {
      const unhandledEntity: never = entity;
      throw new Error(`Unhandled text entity: ${JSON.stringify(unhandledEntity)}`);
    }
  }
}

/** Orders entities as Telegram lists them: by offset, then enclosing entities first. */
export function compareTextEntities(first: TextEntity, second: TextEntity): number {
  if (first.offset !== second.offset) {
    return first.offset - second.offset;
  }
  if (first.length !== second.length) {
    return second.length - first.length;
  }
  return getTypePriority(first) - getTypePriority(second);
}
