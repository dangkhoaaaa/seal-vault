module seal_vault::vault {
    use sui::tx_context::{Self, TxContext};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::string::String;

    // ─── Error codes ────────────────────────────────────────────────────────────
    const ENotOwner: u64 = 0;
    const EEntryNotFound: u64 = 1;

    // ─── Structs ────────────────────────────────────────────────────────────────

    /// One VaultRegistry per user wallet — owned object, invisible to others
    public struct VaultRegistry has key, store {
        id: UID,
        owner: address,
        entries: vector<VaultEntry>,
        next_id: u64,
    }

    public struct VaultEntry has store, copy, drop {
        entry_id: u64,
        site_name: String,      // "Facebook" — plain, for display
        username_hint: String,  // "abc@gmail.com" — plain hint
        blob_id: String,        // Walrus blob containing Seal-encrypted payload
        category: String,       // "social" | "work" | "banking" | "shopping" | "other"
        notes: String,          // Optional plain-text notes (site URL, etc)
        created_at: u64,
    }

    // ─── Events ─────────────────────────────────────────────────────────────────

    public struct VaultCreated has copy, drop { owner: address }
    public struct EntryAdded   has copy, drop { owner: address, entry_id: u64, site_name: String }
    public struct EntryRemoved has copy, drop { owner: address, entry_id: u64 }

    // ─── Functions ───────────────────────────────────────────────────────────────

    /// Create a personal vault (one per wallet, owned object)
    entry fun create_vault(ctx: &mut TxContext) {
        let owner = tx_context::sender(ctx);
        let vault = VaultRegistry {
            id: object::new(ctx),
            owner,
            entries: vector::empty(),
            next_id: 0,
        };
        transfer::transfer(vault, owner);
        event::emit(VaultCreated { owner });
    }

    /// Add a new password entry
    entry fun add_entry(
        vault: &mut VaultRegistry,
        site_name: String,
        username_hint: String,
        blob_id: String,
        category: String,
        notes: String,
        clock: &Clock,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);

        let entry = VaultEntry {
            entry_id: vault.next_id,
            site_name,
            username_hint,
            blob_id,
            category,
            notes,
            created_at: clock::timestamp_ms(clock),
        };

        vector::push_back(&mut vault.entries, entry);
        vault.next_id = vault.next_id + 1;

        event::emit(EntryAdded {
            owner: vault.owner,
            entry_id: entry.entry_id,
            site_name: entry.site_name,
        });
    }

    /// Remove an entry by entry_id
    entry fun remove_entry(
        vault: &mut VaultRegistry,
        entry_id: u64,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.owner, ENotOwner);

        let len = vector::length(&vault.entries);
        let mut i = 0;
        let mut found = false;

        while (i < len) {
            if (vector::borrow(&vault.entries, i).entry_id == entry_id) {
                vector::remove(&mut vault.entries, i);
                found = true;
                break
            };
            i = i + 1;
        };

        assert!(found, EEntryNotFound);
        event::emit(EntryRemoved { owner: vault.owner, entry_id });
    }

    // ─── Getters ────────────────────────────────────────────────────────────────
    public fun get_owner(vault: &VaultRegistry): address { vault.owner }
    public fun get_entries(vault: &VaultRegistry): &vector<VaultEntry> { &vault.entries }
}
