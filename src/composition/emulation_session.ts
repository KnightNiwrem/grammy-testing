import type { EmulationSession } from '../types/emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BotRepository } from '../repositories/bot.ts';
import { BotCommandRepository } from '../repositories/bot_command.ts';
import { BotUpdateRepository } from '../repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../repositories/bot_update_subscription.ts';
import { CallbackQueryRepository } from '../repositories/callback_query.ts';
import { MessageRepository } from '../repositories/message.ts';
import { PrivateConversationRepository } from '../repositories/private_conversation.ts';
import { SharedChatRepository } from '../repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { UserMessageBoxRepository } from '../repositories/user_message_box.ts';
import { BotApiService } from '../services/bot_api.ts';
import { BotCommandService } from '../services/bot_command.ts';
import { BotMessageViewService } from '../services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../services/bot_update_delivery.ts';
import { BotUpdatePollingService } from '../services/bot_update_polling.ts';
import { CallbackQueryService } from '../services/callback_query.ts';
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
  const botMessageViews = new BotMessageViewService({ accounts, bots, userMessageBoxes, messages });
  const botUpdateDelivery = new BotUpdateDeliveryService({
    botMessageViews,
    botUpdates,
    updateSubscriptions,
  });
  const privateConversations = new PrivateConversationRepository();
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations,
    messages,
    userMessageBoxes,
    events: botUpdateDelivery,
    currentUnixTimeSeconds: () => Math.floor(Date.now() / 1_000),
  });
  const callbackQueries = new CallbackQueryService({
    accounts,
    bots,
    privateConversations,
    privateMessages: privateMessaging,
    callbackQueries: new CallbackQueryRepository(),
    events: botUpdateDelivery,
  });

  const botCommands = new BotCommandService({
    accounts,
    bots,
    privateConversations,
    botCommands: new BotCommandRepository(),
  });

  const botUpdatePolling = new BotUpdatePollingService({ botUpdates, updateSubscriptions });
  const botApi = new BotApiService({
    bots,
    updatePolling: botUpdatePolling,
    pendingUpdates: botUpdates,
    botMessages: privateMessaging,
    botMessageViews,
    callbackQueries,
    botCommands,
  });

  return {
    id,
    virtualUsers,
    sharedChatAdministration,
    privateMessaging,
    callbackQueries,
    botCommands,
    botMessageViews,
    botApi,
    end: () => botUpdatePolling.endLongPolling(),
  };
}
