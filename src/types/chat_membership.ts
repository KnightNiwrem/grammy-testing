export type ChatMembership =
  | {
    readonly status: 'owner';
    readonly identityId: number;
  }
  | {
    readonly status: 'member';
    readonly identityId: number;
  };

/**
 * How a former member's membership ended, by the Bot API's status names: the member `left`, or an
 * administrator removed it, which in a supergroup bans it as `kicked` until it is added again.
 */
export type FormerChatMemberStatus = 'left' | 'kicked';

/** Why a bot cannot act in a supergroup it left, or was removed from and so banned from. */
export type FormerSupergroupMemberFailureReason = 'bot_not_a_member' | 'bot_kicked';

/**
 * Why a bot that is not a member of a supergroup cannot act there, given how its membership ended:
 * as on Telegram, a supergroup it never joined is unknown to it, whereas one it left or was removed
 * from turns it away.
 */
export function getSupergroupNonMemberFailureReason(
  formerStatus: FormerChatMemberStatus | undefined,
): 'chat_not_found' | FormerSupergroupMemberFailureReason {
  switch (formerStatus) {
    case undefined:
      return 'chat_not_found';
    case 'left':
      return 'bot_not_a_member';
    case 'kicked':
      return 'bot_kicked';
  }
}
