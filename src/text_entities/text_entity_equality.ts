import type { DateTimeFormat, TextEntity } from '../types/virtual_message.ts';

/** Whether two entity lists mark the same spans, in the same order, with the same arguments. */
export function areTextEntitiesEqual(
  first: readonly TextEntity[],
  second: readonly TextEntity[],
): boolean {
  return first.length === second.length &&
    first.every((entity, index) => isSameTextEntity(entity, second[index]));
}

function isSameTextEntity(first: TextEntity, second: TextEntity): boolean {
  if (first.offset !== second.offset || first.length !== second.length) {
    return false;
  }
  switch (first.type) {
    case 'pre':
      return second.type === 'pre' && first.language === second.language;
    case 'text_link':
      return second.type === 'text_link' && first.url === second.url;
    case 'text_mention':
      return second.type === 'text_mention' && first.userId === second.userId;
    case 'custom_emoji':
      return second.type === 'custom_emoji' && first.customEmojiId === second.customEmojiId;
    case 'date_time':
      return second.type === 'date_time' && first.unixTime === second.unixTime &&
        isSameDateTimeFormat(first.format, second.format);
    default:
      return first.type === second.type;
  }
}

function isSameDateTimeFormat(
  first: DateTimeFormat | undefined,
  second: DateTimeFormat | undefined,
): boolean {
  if (first === undefined || second === undefined) {
    return first === second;
  }
  if (first.kind === 'relative' || second.kind === 'relative') {
    return first.kind === second.kind;
  }
  return first.timePrecision === second.timePrecision &&
    first.datePrecision === second.datePrecision &&
    first.showsDayOfWeek === second.showsDayOfWeek;
}
