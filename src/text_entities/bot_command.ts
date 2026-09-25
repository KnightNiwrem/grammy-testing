import type { TextEntity } from '../types/virtual_message.ts';

const MIN_COMMAND_NAME_LENGTH = 1;
const MAX_COMMAND_NAME_LENGTH = 64;
const MIN_ADDRESSED_USERNAME_LENGTH = 3;
const MAX_ADDRESSED_USERNAME_LENGTH = 32;

const COMMAND_PREFIX = '/';
const ADDRESS_SEPARATOR = '@';
const COMMAND_CHARACTER_PATTERN = /^[A-Za-z0-9_]$/;
const WORD_CHARACTER_PATTERN = /^[\p{L}\p{N}_]$/u;

/**
 * Finds the `bot_command` entities a Telegram client marks in text sent to a chat with a bot.
 *
 * Mirrors TDLib's `match_bot_commands` in `td/telegram/MessageEntity.cpp`: a command is
 * `/[A-Za-z0-9_]{1,64}` with an optional `@[A-Za-z0-9_]{3,32}` address, and it must not touch a
 * word character, `/`, `<`, or `>` on either side. `findDetectedEntities` detects the other
 * entity types.
 */
export function findBotCommandEntities(text: string): TextEntity[] {
  const entities: TextEntity[] = [];
  let position = 0;

  while (true) {
    const commandStart = text.indexOf(COMMAND_PREFIX, position);
    if (commandStart === -1) {
      return entities;
    }
    position = commandStart + COMMAND_PREFIX.length;
    if (commandStart > 0 && isCommandBoundaryBlocker(codePointBefore(text, commandStart))) {
      continue;
    }

    const commandNameStart = position;
    position = skipCommandCharacters(text, position);
    const commandNameLength = position - commandNameStart;
    if (
      commandNameLength < MIN_COMMAND_NAME_LENGTH || commandNameLength > MAX_COMMAND_NAME_LENGTH
    ) {
      continue;
    }

    if (text[position] === ADDRESS_SEPARATOR) {
      const usernameStart = position + ADDRESS_SEPARATOR.length;
      position = skipCommandCharacters(text, usernameStart);
      const usernameLength = position - usernameStart;
      if (
        usernameLength < MIN_ADDRESSED_USERNAME_LENGTH ||
        usernameLength > MAX_ADDRESSED_USERNAME_LENGTH
      ) {
        continue;
      }
    }

    const followingCodePoint = text.codePointAt(position);
    if (followingCodePoint !== undefined && isCommandBoundaryBlocker(followingCodePoint)) {
      continue;
    }
    entities.push({ type: 'bot_command', offset: commandStart, length: position - commandStart });
  }
}

function skipCommandCharacters(text: string, start: number): number {
  let position = start;
  while (position < text.length && COMMAND_CHARACTER_PATTERN.test(text[position])) {
    position++;
  }
  return position;
}

/** Returns the code point that ends immediately before `index`, joining surrogate pairs. */
function codePointBefore(text: string, index: number): number {
  const lastCodeUnit = text.charCodeAt(index - 1);
  const isLowSurrogate = lastCodeUnit >= 0xdc00 && lastCodeUnit <= 0xdfff;
  if (isLowSurrogate && index >= 2) {
    const pairedCodePoint = text.codePointAt(index - 2);
    if (pairedCodePoint !== undefined && pairedCodePoint > 0xffff) {
      return pairedCodePoint;
    }
  }
  return lastCodeUnit;
}

function isCommandBoundaryBlocker(codePoint: number): boolean {
  const character = String.fromCodePoint(codePoint);
  return WORD_CHARACTER_PATTERN.test(character) || character === '/' || character === '<' ||
    character === '>';
}
