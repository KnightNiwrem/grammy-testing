export type ChatMembership =
  | {
    readonly status: 'owner';
    readonly identityId: number;
  }
  | {
    readonly status: 'member';
    readonly identityId: number;
  };
