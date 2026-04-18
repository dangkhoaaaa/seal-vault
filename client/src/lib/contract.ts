import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID } from '@/lib/config';

export { PACKAGE_ID };
export const VAULT_MODULE = 'vault';

export const vaultContract = {
  createVaultTx() {
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::${VAULT_MODULE}::create_vault` });
    return tx;
  },

  addEntryTx(
    vaultId: string,
    siteName: string,
    usernameHint: string,
    blobId: string,
    category: string,
    notes: string,
  ) {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::${VAULT_MODULE}::add_entry`,
      arguments: [
        tx.object(vaultId),
        tx.pure.string(siteName),
        tx.pure.string(usernameHint),
        tx.pure.string(blobId),
        tx.pure.string(category),
        tx.pure.string(notes),
        tx.object('0x6'), // Clock
      ],
    });
    return tx;
  },

  removeEntryTx(vaultId: string, entryId: number) {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::${VAULT_MODULE}::remove_entry`,
      arguments: [
        tx.object(vaultId),
        tx.pure.u64(entryId.toString()),
      ],
    });
    return tx;
  },
};
