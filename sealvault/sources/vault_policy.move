module seal_vault::vault_policy {
    use seal_vault::vault::{Self, VaultRegistry};

    const ENotOwner: u64 = 0;

    /// Seal approve function — key servers simulate this tx before releasing decryption key.
    /// Policy: only the vault owner can decrypt entries.
    entry fun seal_approve(
        id: vector<u8>,
        vault: &VaultRegistry,
        ctx: &TxContext
    ) {
        let _ = id; // id is the vaultId bytes — used as encryption identity
        assert!(vault::get_owner(vault) == tx_context::sender(ctx), ENotOwner);
    }
}
