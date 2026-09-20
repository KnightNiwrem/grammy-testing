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

export interface CreatedVirtualAccount {
  readonly account: VirtualAccountProfile;
}

export type HttpMethod = 'DELETE' | 'POST';

export interface RequestDetails {
  readonly method: HttpMethod;
  readonly url: string;
}
