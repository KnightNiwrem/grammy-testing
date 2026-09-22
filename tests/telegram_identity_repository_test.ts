import {
  type IdentityReservationInput,
  type TelegramIdentity,
  TelegramIdentityRepository,
} from '../src/repositories/telegram_identity.ts';
import { MAX_TELEGRAM_USER_ID, MIN_TELEGRAM_USER_ID } from '../src/types/telegram_identity.ts';

Deno.test('Telegram user IDs use the official MTProto user range', () => {
  if (MIN_TELEGRAM_USER_ID !== 1 || MAX_TELEGRAM_USER_ID !== 1_099_511_627_775) {
    throw new Error('Expected the Telegram user ID range to match the Bot API contract');
  }
});

Deno.test('TelegramIdentityRepository shares sequential IDs across username reservations', () => {
  const identities = new TelegramIdentityRepository();

  const botIdentity = reserveIdentity(identities, { kind: 'bot', username: 'TestBot' });

  const duplicateUsername = identities.reserveIdentity({
    kind: 'account',
    username: 'testbot',
  });
  if (duplicateUsername.reserved || duplicateUsername.reason !== 'username_taken') {
    throw new Error('Expected usernames to be reserved case-insensitively');
  }

  const nextIdentity = reserveIdentity(identities, { kind: 'account' });
  if (botIdentity.kind !== 'bot' || botIdentity.id !== 1 || nextIdentity.id !== 2) {
    throw new Error('Expected a rejected username not to consume a user ID');
  }
});

Deno.test('TelegramIdentityRepository resolves identities by ID and normalized username', () => {
  const identities = new TelegramIdentityRepository();
  const botIdentity = reserveIdentity(identities, { kind: 'bot', username: 'TestBot' });

  if (identities.getById(botIdentity.id) !== botIdentity) {
    throw new Error('Expected identity lookup by ID to return the reservation');
  }
  if (
    identities.getByUsername('TESTBOT') !== botIdentity ||
    identities.getByUsername('unknown') !== undefined
  ) {
    throw new Error('Expected username lookup to be case-insensitive');
  }
});

Deno.test('TelegramIdentityRepository reserves usernames globally across identity kinds', () => {
  const identities = new TelegramIdentityRepository();

  reserveIdentity(identities, {
    kind: 'account',
    username: 'public_name',
  });

  const duplicateSupergroupUsername = identities.reserveIdentity({
    kind: 'supergroup',
    username: 'PUBLIC_NAME',
  });
  if (
    duplicateSupergroupUsername.reserved ||
    duplicateSupergroupUsername.reason !== 'username_taken'
  ) {
    throw new Error('Expected an account username to be unavailable to a supergroup');
  }

  const channelIdentity = reserveIdentity(identities, { kind: 'channel' });
  if (channelIdentity.id !== -1_000_000_000_001) {
    throw new Error('Expected a rejected username not to consume a shared channel ID');
  }
});

Deno.test('TelegramIdentityRepository allocates shared-chat IDs from Telegram ranges', () => {
  const identities = new TelegramIdentityRepository();

  const firstGroup = reserveIdentity(identities, { kind: 'basic_group' });
  const secondGroup = reserveIdentity(identities, { kind: 'basic_group' });
  const supergroup = reserveIdentity(identities, { kind: 'supergroup' });
  const channel = reserveIdentity(identities, { kind: 'channel' });
  if (firstGroup.id !== -1 || secondGroup.id !== -2) {
    throw new Error('Expected basic groups to consume their own descending ID sequence');
  }
  if (
    supergroup.id !== -1_000_000_000_001 ||
    channel.id !== -1_000_000_000_002
  ) {
    throw new Error('Expected supergroups and channels to consume one shared ID sequence');
  }
});

function reserveIdentity(
  identities: TelegramIdentityRepository,
  input: IdentityReservationInput,
): TelegramIdentity {
  const result = identities.reserveIdentity(input);
  if (!result.reserved) {
    throw new Error(`Expected identity reservation to succeed, received ${result.reason}`);
  }
  return result.identity;
}
