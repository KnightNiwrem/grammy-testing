import { TelegramIdentityRegistry } from '../src/telegram_identity_registry.ts';

Deno.test('TelegramIdentityRegistry shares sequential IDs across username reservations', () => {
  const identities = new TelegramIdentityRegistry();

  const botIdentity = identities.reserveIdentity('TestBot');
  if (!botIdentity.reserved || botIdentity.identity.id !== 1) {
    throw new Error('Expected the first identity to receive user ID 1');
  }

  const duplicateUsername = identities.reserveIdentity('testbot');
  if (duplicateUsername.reserved || duplicateUsername.reason !== 'username_taken') {
    throw new Error('Expected usernames to be reserved case-insensitively');
  }

  const userIdentity = identities.reserveIdentity();
  if (!userIdentity.reserved || userIdentity.identity.id !== 2) {
    throw new Error('Expected a rejected username not to consume a user ID');
  }
});
