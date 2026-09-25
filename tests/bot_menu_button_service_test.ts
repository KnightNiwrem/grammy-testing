import { AccountRepository } from '../src/repositories/account.ts';
import { BotRepository } from '../src/repositories/bot.ts';
import { BotMenuButtonRepository } from '../src/repositories/bot_menu_button.ts';
import { TelegramIdentityRepository } from '../src/repositories/telegram_identity.ts';
import {
  BotMenuButtonService,
  type GetBotMenuButtonResult,
  type SetBotMenuButtonResult,
} from '../src/services/bot_menu_button.ts';
import { VirtualUserService } from '../src/services/virtual_user.ts';
import type { BotMenuButton } from '../src/types/bot_menu_button.ts';

Deno.test('BotMenuButtonService prefers a chat button over the button for all chats', () => {
  const { menuButtons, botId, accountId, otherAccountId } = createMenuButtonFixture();
  const webApp: BotMenuButton = { kind: 'web_app', text: 'Shop', url: 'https://shop.example/' };

  assertMenuButton(menuButtons.getBotMenuButton({ botId }), { kind: 'default' });
  assertSet(menuButtons.setBotMenuButton({ botId, menuButton: { kind: 'commands' } }));
  assertSet(menuButtons.setBotMenuButton({ botId, userId: accountId, menuButton: webApp }));

  assertMenuButton(menuButtons.getBotMenuButton({ botId }), { kind: 'commands' });
  assertMenuButton(menuButtons.getBotMenuButton({ botId, userId: accountId }), webApp);
  assertMenuButton(
    menuButtons.getBotMenuButton({ botId, userId: otherAccountId }),
    { kind: 'commands' },
  );
  assertMenuButton(menuButtons.getPrivateChatMenuButton({ accountId, botId }), webApp);

  // The default button removes the chat's own choice, so the button for all chats applies again.
  assertSet(
    menuButtons.setBotMenuButton({ botId, userId: accountId, menuButton: { kind: 'default' } }),
  );
  assertMenuButton(
    menuButtons.getPrivateChatMenuButton({ accountId, botId }),
    { kind: 'commands' },
  );
});

Deno.test('BotMenuButtonService cleans a Web App button and normalizes its URL', () => {
  const { menuButtons, botId } = createMenuButtonFixture();

  assertSet(
    menuButtons.setBotMenuButton({
      botId,
      menuButton: { kind: 'web_app', text: 'Open\tshop\r', url: 'HTTPS://Shop.Example' },
    }),
  );

  assertMenuButton(menuButtons.getBotMenuButton({ botId }), {
    kind: 'web_app',
    text: 'Open shop',
    url: 'https://shop.example/',
  });
});

Deno.test('BotMenuButtonService rejects buttons and users as TDLib does', () => {
  const { menuButtons, botId, accountId } = createMenuButtonFixture();
  const webApp = (text: string, url: string): BotMenuButton => ({ kind: 'web_app', text, url });
  assertSet(menuButtons.setBotMenuButton({ botId, menuButton: { kind: 'commands' } }));

  const cases = [
    [{ botId, userId: botId, menuButton: webApp('', 'x') }, 'user_not_found'],
    [{ botId, menuButton: webApp('', 'https://shop.example') }, 'menu_button_text_empty'],
    [{ botId, menuButton: webApp('\ud800', 'x') }, 'menu_button_text_not_utf8'],
    [{ botId, menuButton: webApp('Shop', '\ud800') }, 'menu_button_url_not_utf8'],
  ] as const;
  for (const [input, expectedReason] of cases) {
    const result = menuButtons.setBotMenuButton(input);
    if (result.set || result.reason !== expectedReason) {
      throw new Error(`Expected ${expectedReason}, received ${JSON.stringify(result)}`);
    }
  }
  const urlCases = [
    ['http://shop.example', "URL 'http://shop.example' is invalid: Only HTTPS links are allowed"],
    [
      'tg://resolve?domain=shop',
      "URL 'tg://resolve?domain=shop' is invalid: Only HTTPS links are allowed",
    ],
    ['https://localhost', "URL 'https://localhost' is invalid: Wrong HTTP URL"],
  ] as const;
  for (const [url, expectedError] of urlCases) {
    const result = menuButtons.setBotMenuButton({ botId, menuButton: webApp('Shop', url) });
    if (
      result.set || result.reason !== 'web_app_url_invalid' || result.urlError !== expectedError
    ) {
      throw new Error(`Expected ${expectedError}, received ${JSON.stringify(result)}`);
    }
  }

  // TDLib reads a Web App button without text whose URL is "default" as the default button.
  assertSet(menuButtons.setBotMenuButton({ botId, menuButton: webApp('', 'default') }));
  assertMenuButton(menuButtons.getBotMenuButton({ botId }), { kind: 'default' });
  const unknownUser = menuButtons.getBotMenuButton({ botId, userId: accountId + 100 });
  if (unknownUser.found || unknownUser.reason !== 'user_not_found') {
    throw new Error(`Expected user_not_found, received ${JSON.stringify(unknownUser)}`);
  }
});

function createMenuButtonFixture() {
  const bots = new BotRepository();
  const accounts = new AccountRepository();
  const virtualUsers = new VirtualUserService({
    identities: new TelegramIdentityRepository(),
    accounts,
    bots,
  });
  const botCreation = virtualUsers.createBot({ first_name: 'Shop Bot', username: 'shop_bot' });
  const accountCreation = virtualUsers.createAccount({ first_name: 'Ada' });
  const otherAccountCreation = virtualUsers.createAccount({ first_name: 'Grace' });
  if (!botCreation.created || !accountCreation.created || !otherAccountCreation.created) {
    throw new Error('Expected the bot and accounts to be created');
  }
  const menuButtons = new BotMenuButtonService({
    accounts,
    bots,
    menuButtons: new BotMenuButtonRepository(),
  });
  return {
    menuButtons,
    botId: botCreation.bot.profile.id,
    accountId: accountCreation.account.profile.id,
    otherAccountId: otherAccountCreation.account.profile.id,
  };
}

function assertSet(result: SetBotMenuButtonResult): void {
  if (!result.set) {
    throw new Error(`Expected the menu button to be set, received ${JSON.stringify(result)}`);
  }
}

function assertMenuButton(
  result: GetBotMenuButtonResult | ReturnType<BotMenuButtonService['getPrivateChatMenuButton']>,
  expectedMenuButton: BotMenuButton,
): void {
  if (!result.found || JSON.stringify(result.menuButton) !== JSON.stringify(expectedMenuButton)) {
    throw new Error(
      `Expected ${JSON.stringify(expectedMenuButton)}, received ${JSON.stringify(result)}`,
    );
  }
}
