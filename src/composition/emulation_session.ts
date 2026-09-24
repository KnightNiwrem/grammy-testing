import type { EmulationSession } from '../types/emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BotRepository } from '../repositories/bot.ts';
import { ChatRepository } from '../repositories/chat.ts';
import { BotUpdateRepository } from '../repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../repositories/bot_update_subscription.ts';
import { MessageRepository } from '../repositories/message.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../repositories/user_message_box.ts';
import { BotApiService } from '../services/bot_api.ts';
import { BotUpdateDeliveryService } from '../services/bot_update_delivery.ts';
import { ChatInteractionService } from '../services/chat_interaction.ts';
import { VirtualUserService } from '../services/virtual_user.ts';

export function createEmulationSession(id: string): EmulationSession {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const chats = new ChatRepository();
  const messages = new MessageRepository();
  const userMessageBoxes = new UserMessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botUpdateDelivery = new BotUpdateDeliveryService({
    accounts,
    bots,
    userMessageBoxes,
    botUpdates,
    updateSubscriptions,
  });
  const chatInteractions = new ChatInteractionService({
    identities,
    accounts,
    bots,
    chats,
    messages,
    userMessageBoxes,
    events: botUpdateDelivery,
    currentUnixTimeSeconds: () => Math.floor(Date.now() / 1_000),
  });

  const botApi = new BotApiService({
    bots,
    botUpdates,
    updateSubscriptions,
    botMessages: chatInteractions,
  });

  return { id, virtualUsers, chatInteractions, botApi, end: () => botApi.endLongPolling() };
}
