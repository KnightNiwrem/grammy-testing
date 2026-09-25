import type {
  BotApiInlineKeyboardButton,
  BotApiInlineKeyboardMarkup,
  BotApiKeyboardButtonFace,
} from '../types/bot_api.ts';
import type { BotApiInlineButtonAction } from '../types/bot_api_rich_message.ts';
import type { ButtonAppearance } from '../types/button_appearance.ts';
import { allowsEveryInlineQueryChat, type InlineKeyboard } from '../types/inline_keyboard.ts';
import type { RichMessageButtonAction } from '../types/rich_message.ts';

export function projectInlineKeyboardMarkup(
  inlineKeyboard: InlineKeyboard,
): BotApiInlineKeyboardMarkup {
  return {
    inline_keyboard: inlineKeyboard.map((row) =>
      row.map((button): BotApiInlineKeyboardButton => ({
        ...projectKeyboardButtonFace(button),
        ...projectInlineButtonAction(button),
      }))
    ),
  };
}

/**
 * Shows what a button of an inline keyboard or a rich message does, as the official Bot API
 * server's `json_store_inline_keyboard_button_type` does: a switch-inline button for a chosen chat
 * that allows every kind of chat shows as a plain `switch_inline_query` button.
 */
export function projectInlineButtonAction(
  action: RichMessageButtonAction,
): BotApiInlineButtonAction {
  switch (action.kind) {
    case 'callback':
      return { callback_data: action.callbackData };
    case 'url':
      return { url: action.url };
    case 'copy_text':
      return { copy_text: { text: action.copiedText } };
    case 'switch_inline_query': {
      const { target, query } = action;
      if (target.kind === 'current_chat') {
        return { switch_inline_query_current_chat: query };
      }
      if (allowsEveryInlineQueryChat(target.chatTypes)) {
        return { switch_inline_query: query };
      }
      return {
        switch_inline_query_chosen_chat: {
          query,
          allow_user_chats: target.chatTypes.allowsUserChats,
          allow_bot_chats: target.chatTypes.allowsBotChats,
          allow_group_chats: target.chatTypes.allowsGroupChats,
          allow_channel_chats: target.chatTypes.allowsChannelChats,
        },
      };
    }
    case 'disabled':
      return { disabled: {} };
    default: {
      const unhandledAction: never = action;
      throw new Error(`Unhandled button action: ${JSON.stringify(unhandledAction)}`);
    }
  }
}

/**
 * Shows a button's text and appearance as the official Bot API server's
 * `JsonInlineKeyboardButton` does, omitting the default style and a missing icon.
 */
function projectKeyboardButtonFace(
  { text, style, iconCustomEmojiId }: ButtonAppearance & { readonly text: string },
): BotApiKeyboardButtonFace {
  return {
    text,
    ...(iconCustomEmojiId === undefined ? {} : { icon_custom_emoji_id: iconCustomEmojiId }),
    ...(style === undefined ? {} : { style }),
  };
}
