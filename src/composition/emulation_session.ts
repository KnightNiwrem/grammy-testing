import type { EmulationSession } from '../types/emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BotRepository } from '../repositories/bot.ts';
import { BotUpdateRepository } from '../repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../repositories/bot_update_subscription.ts';
import { MessageRepository } from '../repositories/message.ts';
import { PrivateConversationRepository } from '../repositories/private_conversation.ts';
import { SharedChatRepository } from '../repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../repositories/user_message_box.ts';
import { BotApiService } from '../services/bot_api.ts';
import { BotUpdateDeliveryService } from '../services/bot_update_delivery.ts';
import { PrivateMessagingService } from '../services/private_messaging.ts';
import { SharedChatAdministrationService } from '../services/shared_chat_administration.ts';
import { VirtualUserService } from '../services/virtual_user.ts';

export function createEmulationSession(id: string): EmulationSession {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const sharedChatAdministration = new SharedChatAdministrationService({
    identities,
    accounts,
    bots,
    sharedChats: new SharedChatRepository(),
  });
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
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations: new PrivateConversationRepository(),
    messages,
    userMessageBoxes,
    events: botUpdateDelivery,
    currentUnixTimeSeconds: () => Math.floor(Date.now() / 1_000),
  });

  const botApi = new BotApiService({
    bots,
    botUpdates,
    updateSubscriptions,
    botMessages: privateMessaging,
  });

  return {
    id,
    virtualUsers,
    sharedChatAdministration,
    privateMessaging,
    botApi,
    end: () => botApi.endLongPolling(),
  };
}
