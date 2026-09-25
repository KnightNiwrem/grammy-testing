import type {
  ButtonContainer,
  ButtonSelector,
  InlineKeyboardMarkup,
  MessageButton,
  MessageWithButtons,
  RichBlock,
  RichBlockCaption,
  RichBlockListItem,
  RichBlockTableCell,
  RichMessageButton,
  RichText,
} from './types.ts';

/** Separates the texts of the cells or buttons of one row in a container's plain text. */
const ROW_ITEM_SEPARATOR = ' | ';
/** How many characters of a container's text an error message shows. */
const DESCRIBED_TEXT_MAX_LENGTH = 40;

/**
 * Thrown when a selector matches no button or several, when the message to select from is not
 * shown, or when the selected button cannot be pressed.
 */
export class ButtonSelectionError extends Error {
  override readonly name = 'ButtonSelectionError';
  /** The buttons the selector matched; empty when it matched none. */
  readonly matches: readonly MessageButton[];

  constructor(message: string, matches: readonly MessageButton[]) {
    super(message);
    this.matches = matches;
  }
}

/** Returns rich text as the plain text a client shows, with buttons shown by their labels. */
export function richTextToPlainText(text: RichText): string {
  if (typeof text === 'string') return text;
  if (isRichTextSequence(text)) return text.map(richTextToPlainText).join('');
  switch (text.type) {
    case 'custom_emoji':
      return text.alternative_text;
    case 'mathematical_expression':
      return text.expression;
    case 'anchor':
      return '';
    case 'button':
      return richTextToPlainText(text.button.text);
    default:
      return richTextToPlainText(text.text);
  }
}

/** Lists a message's buttons in the order the client shows them: rich message, then keyboard. */
export function listButtons(message: MessageWithButtons): readonly MessageButton[] {
  return [
    ...(message.rich_message === undefined
      ? []
      : blockListButtons(message.rich_message.blocks, 'rich_message.blocks', [])),
    ...(message.reply_markup === undefined ? [] : inlineKeyboardButtons(message.reply_markup)),
  ];
}

/**
 * Returns the one button of a message that a selector matches. Throws a `ButtonSelectionError`
 * listing the candidates when it matches none or several.
 */
export function findButton(message: MessageWithButtons, selector: ButtonSelector): MessageButton {
  const buttons = listButtons(message);
  const matches = typeof selector === 'function'
    ? buttons.filter(selector)
    : buttonsMatchingLabel(buttons, selector.label, selector.within);
  const [match] = matches;
  if (match !== undefined && matches.length === 1) return match;

  const selectorDescription = describeSelector(selector);
  if (matches.length === 0) {
    throw new ButtonSelectionError(
      `No button matches ${selectorDescription}. The message shows ${
        buttons.length === 0 ? 'no buttons' : `these buttons:\n${describeButtons(buttons)}`
      }`,
      matches,
    );
  }
  throw new ButtonSelectionError(
    `${matches.length} buttons match ${selectorDescription}:\n${describeButtons(matches)}`,
    matches,
  );
}

function buttonsMatchingLabel(
  buttons: readonly MessageButton[],
  label: string | RegExp,
  within: string | RegExp | undefined,
): readonly MessageButton[] {
  const labelled = buttons.filter((button) =>
    typeof label === 'string' ? button.label === label : matchesPattern(button.label, label)
  );
  if (within === undefined) return labelled;

  // Each button's scope is its innermost container that mentions `within`. A scope that encloses
  // another button's scope, such as a table around the row that mentions an item, is too broad.
  const scoped = labelled.flatMap((button) => {
    const scope = button.containers.findLast((container) =>
      typeof within === 'string'
        ? container.text.includes(within)
        : matchesPattern(container.text, within)
    );
    return scope === undefined ? [] : [{ button, scope }];
  });
  return scoped
    .filter(({ scope }) =>
      !scoped.some((other) => other.scope !== scope && other.button.containers.includes(scope))
    )
    .map(({ button }) => button);
}

/** Tests whether a pattern matches the text, ignoring the `lastIndex` a global pattern keeps. */
function matchesPattern(text: string, pattern: RegExp): boolean {
  return text.search(pattern) !== -1;
}

function* inlineKeyboardButtons(markup: InlineKeyboardMarkup): Generator<MessageButton> {
  for (const [rowIndex, row] of markup.inline_keyboard.entries()) {
    const rowPath = `reply_markup.inline_keyboard[${rowIndex}]`;
    const rowContainer: ButtonContainer = {
      kind: 'inline_keyboard_row',
      text: row.map((button) => button.text).join(ROW_ITEM_SEPARATOR),
      path: rowPath,
    };
    for (const [buttonIndex, button] of row.entries()) {
      yield {
        label: button.text,
        button,
        path: `${rowPath}[${buttonIndex}]`,
        containers: [rowContainer],
      };
    }
  }
}

/**
 * A part of a rich block that holds text, blocks, list items, table rows, or buttons, with its
 * path relative to the block.
 */
type RichBlockPart =
  | { readonly type: 'text'; readonly path: string; readonly text: RichText }
  | { readonly type: 'blocks'; readonly path: string; readonly blocks: readonly RichBlock[] }
  | {
    readonly type: 'list_items';
    readonly path: string;
    readonly items: readonly RichBlockListItem[];
  }
  | {
    readonly type: 'table_rows';
    readonly path: string;
    readonly rows: readonly (readonly RichBlockTableCell[])[];
  }
  | {
    readonly type: 'buttons';
    readonly path: string;
    readonly buttons: readonly RichMessageButton[];
  };

/** The parts of a block that show something, in the order a client shows them. */
function richBlockParts(block: RichBlock): readonly RichBlockPart[] {
  switch (block.type) {
    case 'paragraph':
    case 'footer':
    case 'heading':
    case 'pre':
      return [{ type: 'text', path: '.text', text: block.text }];
    case 'mathematical_expression':
      return [{ type: 'text', path: '.expression', text: block.expression }];
    case 'divider':
    case 'anchor':
      return [];
    case 'list':
      return [{ type: 'list_items', path: '.items', items: block.items }];
    case 'blockquote':
      return [
        { type: 'blocks', path: '.blocks', blocks: block.blocks },
        ...optionalTextPart('.credit', block.credit),
      ];
    case 'expandable_blockquote':
    case 'pullquote':
      return [
        { type: 'text', path: '.text', text: block.text },
        ...optionalTextPart('.credit', block.credit),
      ];
    case 'collage':
    case 'slideshow':
      return [
        { type: 'blocks', path: '.blocks', blocks: block.blocks },
        ...captionParts(block.caption),
      ];
    case 'table':
      return [
        { type: 'table_rows', path: '.cells', rows: block.cells },
        ...optionalTextPart('.caption', block.caption),
      ];
    case 'details':
      return [
        { type: 'text', path: '.summary', text: block.summary },
        { type: 'blocks', path: '.blocks', blocks: block.blocks },
      ];
    case 'buttons':
      return [{ type: 'buttons', path: '.buttons', buttons: block.buttons }];
    case 'map':
    case 'photo':
    case 'document':
      return captionParts(block.caption);
  }
}

function optionalTextPart(path: string, text: RichText | undefined): readonly RichBlockPart[] {
  return text === undefined ? [] : [{ type: 'text', path, text }];
}

function captionParts(caption: RichBlockCaption | undefined): readonly RichBlockPart[] {
  return caption === undefined ? [] : [
    { type: 'text', path: '.caption.text', text: caption.text },
    ...optionalTextPart('.caption.credit', caption.credit),
  ];
}

function blockListText(blocks: readonly RichBlock[]): string {
  return blocks.map(richBlockText).join('\n');
}

function richBlockText(block: RichBlock): string {
  return richBlockParts(block).map(richBlockPartText).join('\n');
}

function richBlockPartText(part: RichBlockPart): string {
  switch (part.type) {
    case 'text':
      return richTextToPlainText(part.text);
    case 'blocks':
      return blockListText(part.blocks);
    case 'list_items':
      return part.items.map((item) => blockListText(item.blocks)).join('\n');
    case 'table_rows':
      return part.rows.map(tableRowText).join('\n');
    case 'buttons':
      return part.buttons.map((button) => richTextToPlainText(button.text)).join(
        ROW_ITEM_SEPARATOR,
      );
  }
}

function tableRowText(row: readonly RichBlockTableCell[]): string {
  return row.map((cell) => cell.text === undefined ? '' : richTextToPlainText(cell.text)).join(
    ROW_ITEM_SEPARATOR,
  );
}

function* blockListButtons(
  blocks: readonly RichBlock[],
  path: string,
  containers: readonly ButtonContainer[],
): Generator<MessageButton> {
  for (const [index, block] of blocks.entries()) {
    const blockPath = `${path}[${index}]`;
    const blockContainers: readonly ButtonContainer[] = [...containers, {
      kind: 'block',
      block,
      siblingBlocks: blocks,
      index,
      text: richBlockText(block),
      path: blockPath,
    }];
    for (const part of richBlockParts(block)) {
      yield* richBlockPartButtons(part, `${blockPath}${part.path}`, blockContainers);
    }
  }
}

function* richBlockPartButtons(
  part: RichBlockPart,
  path: string,
  containers: readonly ButtonContainer[],
): Generator<MessageButton> {
  switch (part.type) {
    case 'text':
      yield* richTextButtons(part.text, path, containers);
      return;
    case 'blocks':
      yield* blockListButtons(part.blocks, path, containers);
      return;
    case 'list_items':
      for (const [index, item] of part.items.entries()) {
        yield* listItemButtons(item, `${path}[${index}]`, containers);
      }
      return;
    case 'table_rows':
      for (const [index, row] of part.rows.entries()) {
        yield* tableRowButtons(row, `${path}[${index}]`, containers);
      }
      return;
    case 'buttons':
      for (const [index, button] of part.buttons.entries()) {
        yield richMessageButton(button, `${path}[${index}]`, containers);
      }
      return;
  }
}

function* listItemButtons(
  item: RichBlockListItem,
  path: string,
  containers: readonly ButtonContainer[],
): Generator<MessageButton> {
  yield* blockListButtons(item.blocks, `${path}.blocks`, [...containers, {
    kind: 'list_item',
    text: blockListText(item.blocks),
    path,
  }]);
}

function* tableRowButtons(
  row: readonly RichBlockTableCell[],
  path: string,
  containers: readonly ButtonContainer[],
): Generator<MessageButton> {
  const rowContainers: readonly ButtonContainer[] = [...containers, {
    kind: 'table_row',
    text: tableRowText(row),
    path,
  }];
  for (const [index, cell] of row.entries()) {
    if (cell.text !== undefined) {
      yield* richTextButtons(cell.text, `${path}[${index}].text`, rowContainers);
    }
  }
}

function* richTextButtons(
  text: RichText,
  path: string,
  containers: readonly ButtonContainer[],
): Generator<MessageButton> {
  if (typeof text === 'string') return;
  if (isRichTextSequence(text)) {
    for (const [index, element] of text.entries()) {
      yield* richTextButtons(element, `${path}[${index}]`, containers);
    }
    return;
  }
  if (text.type === 'button') {
    yield richMessageButton(text.button, `${path}.button`, containers);
  } else if ('text' in text) {
    yield* richTextButtons(text.text, `${path}.text`, containers);
  }
}

function richMessageButton(
  button: RichMessageButton,
  path: string,
  containers: readonly ButtonContainer[],
): MessageButton {
  return { label: richTextToPlainText(button.text), button, path, containers };
}

function isRichTextSequence(text: RichText): text is readonly RichText[] {
  return Array.isArray(text);
}

function describeSelector(selector: ButtonSelector): string {
  if (typeof selector === 'function') return 'the predicate';
  const label = `label ${describeTextMatcher(selector.label)}`;
  return selector.within === undefined
    ? label
    : `${label} within ${describeTextMatcher(selector.within)}`;
}

function describeTextMatcher(matcher: string | RegExp): string {
  return typeof matcher === 'string' ? JSON.stringify(matcher) : String(matcher);
}

function describeButtons(buttons: readonly MessageButton[]): string {
  return buttons.map((button) => {
    const containers = button.containers.map((container) =>
      `${container.kind === 'block' ? container.block.type : container.kind} ${
        JSON.stringify(truncate(container.text))
      }`
    );
    return `- ${JSON.stringify(button.label)} at ${button.path} in ${containers.join(' › ')}`;
  }).join('\n');
}

function truncate(text: string): string {
  return text.length <= DESCRIBED_TEXT_MAX_LENGTH
    ? text
    : `${text.slice(0, DESCRIBED_TEXT_MAX_LENGTH - 1)}…`;
}
