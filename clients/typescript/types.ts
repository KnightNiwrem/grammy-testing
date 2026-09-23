/** The server-assigned identity and Bot API location for an emulation session. */
export interface EmulationSession {
  readonly id: string;
  readonly botApiRoot: string;
}

export interface CreateVirtualBotInput {
  readonly first_name: string;
  readonly username: string;
}

export interface VirtualBotProfile {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly username: string;
  readonly can_join_groups: boolean;
  readonly can_read_all_group_messages: boolean;
  readonly supports_guest_queries?: boolean;
  readonly supports_inline_queries: boolean;
  readonly can_connect_to_business: boolean;
  readonly has_main_web_app: boolean;
  readonly has_topics_enabled: boolean;
  readonly allows_users_to_create_topics: boolean;
  readonly can_manage_bots: boolean;
  readonly supports_join_request_queries: boolean;
}

export interface CreatedVirtualBot {
  readonly token: string;
  readonly bot: VirtualBotProfile;
}

export interface CreateVirtualAccountInput {
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
}

export interface VirtualAccountProfile {
  readonly id: number;
  readonly is_bot: false;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
}

export interface PrivateMessageTarget {
  readonly type: 'private';
  readonly botId: number;
}

export interface AccountSendMessageInput {
  readonly to: PrivateMessageTarget;
  readonly text: string;
}

export interface AccountMessageHistoryInput {
  readonly chat: PrivateMessageTarget;
}

export interface PrivateChat {
  readonly id: number;
  readonly type: 'private';
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

/** Offsets and lengths count UTF-16 code units. */
export interface MessageEntity {
  readonly type: 'bot_command';
  readonly offset: number;
  readonly length: number;
}

/** A bot as a message sender, without the capabilities that only getMe reports. */
export interface MessageSenderBot {
  readonly id: number;
  readonly is_bot: true;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username: string;
}

/**
 * A private-chat message as the conversation's bot sees it: numbered in the bot's message box,
 * with the account as its chat, whichever participant wrote it.
 */
export interface PrivateTextMessage {
  readonly message_id: number;
  readonly from: VirtualAccountProfile | MessageSenderBot;
  readonly chat: PrivateChat;
  readonly date: number;
  readonly text: string;
  readonly entities?: readonly MessageEntity[];
}

export interface VirtualAccountClient extends VirtualAccountProfile {
  /** Sends a message as this virtual Telegram account. */
  sendMessage(input: AccountSendMessageInput): Promise<PrivateTextMessage>;
  /** Returns messages written by either participant of a private conversation, oldest first. */
  getMessages(input: AccountMessageHistoryInput): Promise<readonly PrivateTextMessage[]>;
}

export interface CreatedVirtualAccount {
  readonly account: VirtualAccountClient;
}

export type HttpMethod = 'DELETE' | 'GET' | 'POST';

export interface RequestDetails {
  readonly method: HttpMethod;
  readonly url: string;
}
