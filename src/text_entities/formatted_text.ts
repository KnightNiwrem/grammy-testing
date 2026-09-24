import type { FormattedText, TextEntity } from '../types/virtual_message.ts';
import { findBotCommandEntities } from './bot_command.ts';
import {
  isRemovedCharacter,
  isReplacedWithSpace,
  replaceRepeatedDirectionMarks,
} from './input_string.ts';
import { checkLink, getLinkUserId, parseCustomEmojiId } from './telegram_link.ts';
import { compareTextEntities } from './text_entity_order.ts';

/**
 * Normalizes message text and its entities as Telegram does before sending a message, mirroring
 * `get_message_entities` and `fix_formatted_text` in TDLib's `td/telegram/MessageEntity.cpp`.
 *
 * Failures carry TDLib's own error message.
 */

export type FormattedTextFixing =
  | { readonly fixed: true; readonly formattedText: FormattedText }
  | { readonly fixed: false; readonly error: string };

/**
 * How text without visible content is treated. Message text must have some. A caption may be
 * empty: text with nothing but spaces and line breaks becomes an empty caption, and so does text of
 * only invisible characters, such as zero-width spaces, from an account; from a bot, such text is
 * kept, as TDLib's `allow_empty_string` keeps it for bots.
 */
export type EmptyTextTreatment = 'reject' | 'clear' | 'keep_invisible_characters';

export interface FormattedTextFixingContext {
  /** Whether a user a text mention names can be mentioned. */
  isMentionableUser(userId: number): boolean;
}

/** Telegram rejects entity offsets and lengths beyond this bound. */
const MAX_ENTITY_BOUND = 1_000_000;

/** Line breaks and spaces, the characters Telegram trims from the ends of a message. */
const TRIMMED_CHARACTERS = ' \n';

/**
 * Characters that Telegram treats as empty when deciding whether text has visible content: spaces,
 * zero-width characters, direction marks, and tag characters. Mirrors `strip_empty_characters` in
 * TDLib's `td/telegram/misc.cpp`.
 */
const EMPTY_TEXT_PATTERN =
  /^[ \n\u00a0\u1680\u180e\u2000-\u200f\u202e\u202f\u205f\u2800\u3000\ufeff\ufffc\u{e0000}-\u{e007f}]*$/u;

/**
 * Validates entity arguments, then cleans the text, trims it, and makes entities consistent:
 * sorted, properly nested, with same-type formatting merged and split around links and code.
 * Finally marks the bot commands that Telegram detects in chats with bots, which every emulated
 * chat is.
 *
 * Text links to `tg://user?id=` become text mentions, as on Telegram.
 */
export function fixFormattedText(
  text: string,
  inputEntities: readonly TextEntity[],
  context: FormattedTextFixingContext,
  emptyTextTreatment: EmptyTextTreatment = 'reject',
): FormattedTextFixing {
  const argumentValidation = validateEntityArguments(inputEntities, context);
  if (!argumentValidation.valid) {
    return { fixed: false, error: argumentValidation.error };
  }
  if (!text.isWellFormed()) {
    return { fixed: false, error: 'Strings must be encoded in UTF-8' };
  }

  let entities = argumentValidation.entities;
  if (entities.length > 0) {
    for (const entity of entities) {
      if (entity.offset < 0 || entity.offset > MAX_ENTITY_BOUND) {
        return { fixed: false, error: `Receive an entity with incorrect offset ${entity.offset}` };
      }
      if (entity.length < 0 || entity.length > MAX_ENTITY_BOUND) {
        return { fixed: false, error: `Receive an entity with incorrect length ${entity.length}` };
      }
    }
    entities = fixEntities(removeEmptyEntities(entities));
  }
  const cleaning = cleanText(text, entities);
  if (!cleaning.cleaned) {
    return { fixed: false, error: cleaning.error };
  }
  let cleanedText = cleaning.text;

  entities = removeEmptyEntities(cleaning.entities);
  const lastVisibleIndex = findLastVisibleCodeUnitIndex(cleanedText);
  if (lastVisibleIndex === -1) {
    return emptyTextTreatment === 'reject'
      ? { fixed: false, error: 'Text must be non-empty' }
      : { fixed: true, formattedText: { text: '', entities: [] } };
  }
  entities = fixEntities(entities);

  // Trim the end, cutting entities at the new end.
  const trimmedEnd = lastVisibleIndex + 1;
  cleanedText = cleanedText.slice(0, trimmedEnd);
  entities = entities
    .filter((entity) => entity.offset < trimmedEnd)
    .map((entity) =>
      entity.offset + entity.length > trimmedEnd
        ? { ...entity, length: trimmedEnd - entity.offset }
        : entity
    )
    .sort(compareTextEntities);

  // Trim the start, but never into an entity.
  const firstEntityOffset = entities[0]?.offset ?? cleanedText.length;
  let trimmedStart = 0;
  while (
    trimmedStart < firstEntityOffset && TRIMMED_CHARACTERS.includes(cleanedText[trimmedStart])
  ) {
    trimmedStart++;
  }
  const fixedText = cleanedText.slice(trimmedStart);
  entities = entities.map((entity) => ({ ...entity, offset: entity.offset - trimmedStart }));

  if (EMPTY_TEXT_PATTERN.test(fixedText)) {
    switch (emptyTextTreatment) {
      case 'reject':
        return { fixed: false, error: 'Text must be non-empty' };
      case 'clear':
        return { fixed: true, formattedText: { text: '', entities: [] } };
      case 'keep_invisible_characters':
        break;
      default: {
        const unhandledTreatment: never = emptyTextTreatment;
        throw new Error(`Unhandled empty text treatment: ${unhandledTreatment}`);
      }
    }
  }

  return {
    fixed: true,
    formattedText: {
      text: fixedText,
      entities: mergeDetectedEntities(entities, findBotCommandEntities(fixedText)),
    },
  };
}

type EntityArgumentValidation =
  | { readonly valid: true; readonly entities: TextEntity[] }
  | { readonly valid: false; readonly error: string };

/** Checks the arguments of entities a sender supplied, as TDLib's `get_message_entities` does. */
function validateEntityArguments(
  entities: readonly TextEntity[],
  context: FormattedTextFixingContext,
): EntityArgumentValidation {
  const validatedEntities: TextEntity[] = [];
  for (const entity of entities) {
    switch (entity.type) {
      case 'text_link': {
        const userId = getLinkUserId(entity.url);
        if (userId !== undefined) {
          if (!context.isMentionableUser(userId)) {
            return { valid: false, error: 'User not found' };
          }
          validatedEntities.push({
            type: 'text_mention',
            offset: entity.offset,
            length: entity.length,
            userId,
          });
          break;
        }
        const linkCheck = checkLink(entity.url);
        if (!linkCheck.valid) {
          return { valid: false, error: `Entity ${linkCheck.error}` };
        }
        validatedEntities.push({ ...entity, url: linkCheck.url });
        break;
      }
      case 'text_mention':
        if (!context.isMentionableUser(entity.userId)) {
          return { valid: false, error: 'User not found' };
        }
        validatedEntities.push({ ...entity });
        break;
      case 'custom_emoji':
        if (parseCustomEmojiId(entity.customEmojiId) === undefined) {
          return { valid: false, error: 'Invalid custom emoji identifier specified' };
        }
        validatedEntities.push({ ...entity });
        break;
      default:
        validatedEntities.push({ ...entity });
    }
  }
  return { valid: true, entities: validatedEntities };
}

function removeEmptyEntities(entities: readonly TextEntity[]): TextEntity[] {
  return entities.filter((entity) => entity.length > 0);
}

type TextCleaning =
  | { readonly cleaned: true; readonly text: string; readonly entities: TextEntity[] }
  | { readonly cleaned: false; readonly error: string };

/**
 * Replaces control characters with spaces and removes the characters Telegram removes, shifting
 * the sorted entities to match. Mirrors TDLib's `clean_input_string_with_entities`, including its
 * errors for entities that split a character or end past the text.
 */
function cleanText(text: string, sortedEntities: readonly TextEntity[]): TextCleaning {
  const entities = [...sortedEntities];
  interface OpenEntity {
    readonly index: number;
    readonly removedBeforeEntity: number;
  }
  const openEntities: OpenEntity[] = [];
  let nextEntityIndex = 0;
  let utf16Offset = 0;
  let removedCodeUnits = 0;
  let utf8Offset = 0;
  let cleanedText = '';

  const codePoints = [...text];
  for (let codePointIndex = 0; codePointIndex <= codePoints.length; codePointIndex++) {
    while (openEntities.length > 0) {
      const openEntity = openEntities[openEntities.length - 1];
      const entity = entities[openEntity.index];
      const entityEnd = entity.offset + entity.length;
      if (utf16Offset < entityEnd) {
        break;
      }
      if (utf16Offset !== entityEnd) {
        return {
          cleaned: false,
          error:
            `Entity beginning at UTF-16 offset ${entity.offset} ends in a middle of a UTF-16 symbol at byte offset ${utf8Offset}`,
        };
      }
      entities[openEntity.index] = {
        ...entity,
        offset: entity.offset - openEntity.removedBeforeEntity,
        length: entity.length - (removedCodeUnits - openEntity.removedBeforeEntity),
      };
      openEntities.pop();
    }
    while (nextEntityIndex < entities.length && utf16Offset >= entities[nextEntityIndex].offset) {
      if (utf16Offset !== entities[nextEntityIndex].offset) {
        return {
          cleaned: false,
          error: `Entity begins in a middle of a UTF-16 symbol at byte offset ${utf8Offset}`,
        };
      }
      openEntities.push({ index: nextEntityIndex++, removedBeforeEntity: removedCodeUnits });
    }
    if (codePointIndex === codePoints.length) {
      break;
    }

    const character = codePoints[codePointIndex];
    const codePoint = character.codePointAt(0) ?? 0;
    utf16Offset += character.length;
    utf8Offset += utf8Length(codePoint);
    if (isReplacedWithSpace(codePoint)) {
      cleanedText += ' ';
    } else if (isRemovedCharacter(codePoint)) {
      removedCodeUnits += character.length;
    } else {
      cleanedText += character;
    }
  }

  if (nextEntityIndex !== entities.length) {
    return {
      cleaned: false,
      error: `Entity begins after the end of the text at UTF-16 offset ${
        entities[nextEntityIndex].offset
      }`,
    };
  }
  const unclosedEntity = openEntities.at(-1);
  if (unclosedEntity !== undefined) {
    const entity = entities[unclosedEntity.index];
    return {
      cleaned: false,
      error:
        `Entity beginning at UTF-16 offset ${entity.offset} ends after the end of the text at UTF-16 offset ${
          entity.offset + entity.length
        }`,
    };
  }

  return { cleaned: true, text: replaceRepeatedDirectionMarks(cleanedText), entities };
}

/** Returns the index of the last UTF-16 code unit that is neither a space nor a line break. */
function findLastVisibleCodeUnitIndex(text: string): number {
  let index = text.length - 1;
  while (index >= 0 && TRIMMED_CHARACTERS.includes(text[index])) {
    index--;
  }
  return index;
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
}

/**
 * Entity categories from TDLib's type masks: formatting that can be split and merged, blockquotes,
 * code, and continuous entities that must stay whole.
 */
type TextEntityCategory = 'splittable' | 'blockquote' | 'pre' | 'continuous';

const SPLITTABLE_ENTITY_TYPES = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'spoiler',
] as const;
type SplittableEntityType = typeof SPLITTABLE_ENTITY_TYPES[number];

function getEntityCategory(entity: TextEntity): TextEntityCategory {
  switch (entity.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strikethrough':
    case 'spoiler':
      return 'splittable';
    case 'blockquote':
    case 'expandable_blockquote':
      return 'blockquote';
    case 'pre':
    case 'code':
      return 'pre';
    case 'bot_command':
    case 'text_link':
    case 'text_mention':
    case 'custom_emoji':
      return 'continuous';
    default: {
      const unhandledEntity: never = entity;
      throw new Error(`Unhandled text entity: ${JSON.stringify(unhandledEntity)}`);
    }
  }
}

function isSplittableEntityType(type: TextEntity['type']): type is SplittableEntityType {
  return (SPLITTABLE_ENTITY_TYPES as readonly string[]).includes(type);
}

/** TDLib's entity type, which tells a code block with a language from one without. */
function getTdlibEntityKind(entity: TextEntity): string {
  return entity.type === 'pre' && entity.language !== undefined ? 'pre_code' : entity.type;
}

function entityEnd(entity: TextEntity): number {
  return entity.offset + entity.length;
}

/**
 * Sorts entities and, if they are not already consistent, drops intersecting links and code,
 * then merges and splits formatting around them. Mirrors TDLib's `fix_entities`.
 */
function fixEntities(entities: readonly TextEntity[]): TextEntity[] {
  const sortedEntities = [...entities].sort(compareTextEntities);
  if (areEntitiesValid(sortedEntities)) {
    return sortedEntities;
  }

  let continuousEntities: TextEntity[] = [];
  const blockquoteEntities: TextEntity[] = [];
  const splittableEntities: TextEntity[] = [];
  for (const entity of sortedEntities) {
    switch (getEntityCategory(entity)) {
      case 'splittable':
        splittableEntities.push(entity);
        break;
      case 'blockquote':
        blockquoteEntities.push(entity);
        break;
      default:
        continuousEntities.push(entity);
    }
  }
  continuousEntities = removeIntersectingEntities(continuousEntities);

  if (blockquoteEntities.length > 0) {
    const nonIntersectingBlockquotes = removeIntersectingEntities(blockquoteEntities);
    continuousEntities = [
      ...removeEntitiesIntersectingBlockquote(continuousEntities, nonIntersectingBlockquotes),
      ...nonIntersectingBlockquotes,
    ].sort(compareTextEntities);
  }

  return resplitEntities(splittableEntities, continuousEntities);
}

/** Mirrors TDLib's `are_entities_valid`: whether sorted entities need no fixing. */
function areEntitiesValid(entities: readonly TextEntity[]): boolean {
  const splittableEnds = new Map<SplittableEntityType, number>();
  const enclosingEntities: TextEntity[] = [];
  const enclosingKinds = new Set<string>();
  const enclosingCategories: TextEntityCategory[] = [];

  for (const entity of entities) {
    while (
      enclosingEntities.length > 0 && entity.offset >= entityEnd(enclosingEntities.at(-1)!)
    ) {
      enclosingKinds.delete(getTdlibEntityKind(enclosingEntities.pop()!));
      enclosingCategories.pop();
    }

    const category = getEntityCategory(entity);
    const parent = enclosingEntities.at(-1);
    if (parent !== undefined) {
      if (entityEnd(entity) > entityEnd(parent)) {
        return false;
      }
      if (enclosingKinds.has(getTdlibEntityKind(entity))) {
        return false;
      }
      if (getEntityCategory(parent) === 'pre') {
        return false;
      }
      if (
        category === 'pre' && enclosingCategories.some((enclosing) => enclosing !== 'blockquote')
      ) {
        return false;
      }
      if (
        (category === 'continuous' || category === 'blockquote') &&
        enclosingCategories.includes('continuous')
      ) {
        return false;
      }
      if (category === 'blockquote' && enclosingCategories.includes('blockquote')) {
        return false;
      }
      if (enclosingCategories.includes('splittable')) {
        return false;
      }
    }

    if (isSplittableEntityType(entity.type)) {
      const previousEnd = splittableEnds.get(entity.type);
      if (previousEnd !== undefined && previousEnd >= entity.offset) {
        return false;
      }
      splittableEnds.set(entity.type, entityEnd(entity));
    }
    enclosingEntities.push(entity);
    enclosingKinds.add(getTdlibEntityKind(entity));
    enclosingCategories.push(category);
  }
  return true;
}

/** Keeps each sorted entity that begins after every entity kept before it ends. */
function removeIntersectingEntities(entities: readonly TextEntity[]): TextEntity[] {
  const keptEntities: TextEntity[] = [];
  let lastKeptEnd = 0;
  for (const entity of entities) {
    if (entity.offset >= lastKeptEnd) {
      keptEntities.push(entity);
      lastKeptEnd = entityEnd(entity);
    }
  }
  return keptEntities;
}

/**
 * Drops entities that cross a blockquote's boundary; an entity inside a blockquote stays. Both
 * lists must be sorted and free of intersections.
 */
function removeEntitiesIntersectingBlockquote(
  entities: readonly TextEntity[],
  blockquotes: readonly TextEntity[],
): TextEntity[] {
  let blockquoteIndex = 0;
  return entities.filter((entity) => {
    while (
      blockquoteIndex < blockquotes.length &&
      (getEntityCategory(blockquotes[blockquoteIndex]) !== 'blockquote' ||
        entityEnd(blockquotes[blockquoteIndex]) <= entity.offset)
    ) {
      blockquoteIndex++;
    }
    const blockquote = blockquotes[blockquoteIndex];
    return blockquote === undefined ||
      !(entityEnd(blockquote) < entityEnd(entity) ||
        (entity.offset < blockquote.offset && blockquote.offset < entityEnd(entity)));
  });
}

/** Splits formatting around the other entities and joins it with them, as `resplit_entities` does. */
function resplitEntities(
  splittableEntities: readonly TextEntity[],
  otherEntities: TextEntity[],
): TextEntity[] {
  if (splittableEntities.length === 0) {
    return otherEntities;
  }
  const splitEntities = splitFormattingEntities(splittableEntities, otherEntities);
  if (otherEntities.length === 0) {
    return splitEntities;
  }
  return [...otherEntities, ...splitEntities].sort(compareTextEntities);
}

/**
 * Merges overlapping and adjacent formatting of each type, then cuts it at the boundaries of the
 * other entities and drops it inside code. Mirrors TDLib's `split_entities`.
 */
function splitFormattingEntities(
  splittableEntities: readonly TextEntity[],
  otherEntities: readonly TextEntity[],
): TextEntity[] {
  // Active formatting runs by type; an end of 0 marks a type with no active run.
  const runBegins = new Map<SplittableEntityType, number>();
  const runEnds = new Map<SplittableEntityType, number>();
  const splitEntities: TextEntity[] = [];
  let nextSplittableIndex = 0;

  const flushRuns = (offset: number) => {
    for (const type of SPLITTABLE_ENTITY_TYPES) {
      const runBegin = runBegins.get(type) ?? 0;
      const runEnd = runEnds.get(type) ?? 0;
      if (runEnd !== 0 && runBegin < offset) {
        if (runEnd <= offset) {
          splitEntities.push({ type, offset: runBegin, length: runEnd - runBegin });
          runBegins.set(type, 0);
          runEnds.set(type, 0);
        } else {
          splitEntities.push({ type, offset: runBegin, length: offset - runBegin });
          runBegins.set(type, offset);
        }
      }
    }
  };

  const addRunsUntil = (endOffset: number) => {
    while (nextSplittableIndex < splittableEntities.length) {
      const entity = splittableEntities[nextSplittableIndex];
      if (entity.offset >= endOffset) {
        break;
      }
      if (!isSplittableEntityType(entity.type)) {
        throw new Error(`Entity ${entity.type} cannot be split`);
      }
      const runEnd = runEnds.get(entity.type) ?? 0;
      if (entity.offset <= runEnd && runEnd !== 0) {
        runEnds.set(entity.type, Math.max(runEnd, entityEnd(entity)));
      } else {
        flushRuns(entity.offset);
        runBegins.set(entity.type, entity.offset);
        runEnds.set(entity.type, entityEnd(entity));
      }
      nextSplittableIndex++;
    }
    flushRuns(endOffset);
  };

  const enclosingEntities: TextEntity[] = [];
  const advanceTo = (offset: number) => {
    while (enclosingEntities.length > 0 && offset >= entityEnd(enclosingEntities.at(-1)!)) {
      const enclosingEntity = enclosingEntities.pop()!;
      const splitCountBefore = splitEntities.length;
      addRunsUntil(entityEnd(enclosingEntity));
      if (getEntityCategory(enclosingEntity) === 'pre') {
        // Code shows no formatting.
        splitEntities.length = splitCountBefore;
      }
    }
    addRunsUntil(offset);
  };
  for (const otherEntity of otherEntities) {
    advanceTo(otherEntity.offset);
    enclosingEntities.push(otherEntity);
  }
  advanceTo(Number.MAX_SAFE_INTEGER);

  return splitEntities.sort(compareTextEntities);
}

/**
 * Adds automatically detected entities that fit around the existing ones, as TDLib's
 * `merge_new_entities` does. Detected entities must be sorted and free of intersections.
 */
function mergeDetectedEntities(
  entities: readonly TextEntity[],
  detectedEntities: readonly TextEntity[],
): TextEntity[] {
  if (detectedEntities.length === 0) {
    return [...entities];
  }

  let continuousEntities: TextEntity[] = [];
  const blockquoteEntities: TextEntity[] = [];
  const splittableEntities: TextEntity[] = [];
  for (const entity of entities) {
    switch (getEntityCategory(entity)) {
      case 'splittable':
        splittableEntities.push(entity);
        break;
      case 'blockquote':
        blockquoteEntities.push(entity);
        break;
      default:
        continuousEntities.push(entity);
    }
  }

  const fittingDetectedEntities = removeEntitiesIntersectingBlockquote(
    detectedEntities,
    blockquoteEntities,
  );
  continuousEntities = mergeNonIntersectingEntities(continuousEntities, fittingDetectedEntities);
  if (blockquoteEntities.length > 0) {
    continuousEntities = [...continuousEntities, ...blockquoteEntities].sort(compareTextEntities);
  }
  return resplitEntities(splittableEntities, continuousEntities);
}

/** Adds new entities that do not overlap any existing entity, as TDLib's `merge_entities` does. */
function mergeNonIntersectingEntities(
  existingEntities: readonly TextEntity[],
  newEntities: readonly TextEntity[],
): TextEntity[] {
  const mergedEntities: TextEntity[] = [];
  let newIndex = 0;
  for (const existingEntity of existingEntities) {
    while (
      newIndex < newEntities.length && entityEnd(newEntities[newIndex]) <= existingEntity.offset
    ) {
      mergedEntities.push(newEntities[newIndex++]);
    }
    mergedEntities.push(existingEntity);
    while (
      newIndex < newEntities.length && newEntities[newIndex].offset < entityEnd(existingEntity)
    ) {
      newIndex++;
    }
  }
  mergedEntities.push(...newEntities.slice(newIndex));
  return mergedEntities;
}
