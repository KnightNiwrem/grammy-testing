import type { EmulationSession } from '../types/emulation_session.ts';
import { AccountRepository } from '../repositories/account.ts';
import { BlockedUserRepository } from '../repositories/blocked_user.ts';
import { BotRepository } from '../repositories/bot.ts';
import { BotCommandRepository } from '../repositories/bot_command.ts';
import { BotUpdateRepository } from '../repositories/bot_update.ts';
import { BotUpdateSubscriptionRepository } from '../repositories/bot_update_subscription.ts';
import { CallbackQueryRepository } from '../repositories/callback_query.ts';
import { FileRepository } from '../repositories/file.ts';
import { MessageRepository } from '../repositories/message.ts';
import { PrivateConversationRepository } from '../repositories/private_conversation.ts';
import { SharedChatRepository } from '../repositories/shared_chat.ts';
import { TelegramIdentityRepository } from '../repositories/telegram_identity.ts';
import { MessageBoxRepository } from '../repositories/message_box.ts';
import { BotApiService } from '../services/bot_api.ts';
import { BotBlockingService } from '../services/bot_blocking.ts';
import { BotCommandService } from '../services/bot_command.ts';
import { BotMessageViewService } from '../services/bot_message_view.ts';
import { BotUpdateDeliveryService } from '../services/bot_update_delivery.ts';
import { BotUpdatePollingService } from '../services/bot_update_polling.ts';
import { CallbackQueryService } from '../services/callback_query.ts';
import { MediaFileService } from '../services/media_file.ts';
import { PrivateMessagingService } from '../services/private_messaging.ts';
import { SharedChatAdministrationService } from '../services/shared_chat_administration.ts';
import { SupergroupMessagingService } from '../services/supergroup_messaging.ts';
import { VirtualUserService } from '../services/virtual_user.ts';

export function createEmulationSession(id: string): EmulationSession {
  const identities = new TelegramIdentityRepository();
  const accounts = new AccountRepository();
  const bots = new BotRepository();
  const virtualUsers = new VirtualUserService({ identities, accounts, bots });
  const sharedChats = new SharedChatRepository();
  const messages = new MessageRepository();
  const files = new FileRepository();
  const messageBoxes = new MessageBoxRepository();
  const botUpdates = new BotUpdateRepository();
  const updateSubscriptions = new BotUpdateSubscriptionRepository();
  const botMessageViews = new BotMessageViewService({
    accounts,
    bots,
    sharedChats,
    messageBoxes,
    messages,
    files,
  });
  const botUpdateDelivery = new BotUpdateDeliveryService({
    botMessageViews,
    botUpdates,
    updateSubscriptions,
    bots,
    sharedChats,
    messages,
  });
  const currentUnixTimeSeconds = () => Math.floor(Date.now() / 1_000);
  const supergroupMessaging = new SupergroupMessagingService({
    accounts,
    bots,
    sharedChats,
    messages,
    files,
    messageBoxes,
    events: botUpdateDelivery,
    currentUnixTimeSeconds,
  });
  const sharedChatAdministration = new SharedChatAdministrationService({
    identities,
    accounts,
    bots,
    sharedChats,
    supergroupMessages: supergroupMessaging,
    events: botUpdateDelivery,
    currentUnixTimeSeconds,
  });
  const privateConversations = new PrivateConversationRepository();
  const blockedUsers = new BlockedUserRepository();
  const privateMessaging = new PrivateMessagingService({
    accounts,
    bots,
    privateConversations,
    messages,
    files,
    messageBoxes,
    blockedUsers,
    events: botUpdateDelivery,
    currentUnixTimeSeconds,
  });
  const mediaFiles = new MediaFileService({ files });
  const botBlocking = new BotBlockingService({
    accounts,
    bots,
    blockedUsers,
    events: botUpdateDelivery,
    currentUnixTimeSeconds,
  });
  const callbackQueries = new CallbackQueryService({
    accounts,
    bots,
    privateConversations,
    privateMessages: privateMessaging,
    sharedChats,
    supergroupMessages: supergroupMessaging,
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
    supergroupBotMessages: supergroupMessaging,
    chatMemberships: sharedChatAdministration,
    botMessageViews,
    mediaFiles,
    callbackQueries,
    botCommands,
  });

  return {
    id,
    virtualUsers,
    sharedChatAdministration,
    privateMessaging,
    supergroupMessaging,
    botBlocking,
    callbackQueries,
    botCommands,
    botMessageViews,
    mediaFiles,
    botApi,
    end: () => botUpdatePolling.endLongPolling(),
  };
}
