import { AccountRegistry } from '../src/account_registry.ts';
import type { VirtualAccount } from '../src/virtual_account.ts';

Deno.test('AccountRegistry adds and retrieves an account without overwriting its ID', () => {
  const accounts = new AccountRegistry();
  const account: VirtualAccount = {
    profile: {
      id: 1,
      is_bot: false,
      first_name: 'Ada',
    },
  };

  if (!accounts.add(account)) {
    throw new Error('Expected the account to be added');
  }
  if (accounts.getById(account.profile.id) !== account) {
    throw new Error('Expected ID lookup to return the added account');
  }
  if (accounts.add(account)) {
    throw new Error('Expected a duplicate account ID not to overwrite the stored account');
  }
});
