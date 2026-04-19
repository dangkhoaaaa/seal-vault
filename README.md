# SealVault — Decentralized Password Manager on Sui

> **Built for the Sui Overflow Hackathon**

**SealVault** is a next-generation, fully decentralized password manager built on the **Sui Network**. Users store encrypted credentials with complete self-custody — no centralized servers, no subscription lock-in, and no trusted third party ever holds your data.

**[Watch the Demo Video](https://drive.google.com/file/d/1d6OWzYWjzL772uAbkFGmpPDqiWJtrGL8/view?usp=sharing)**

---

## Demo

**[Watch the demo video](https://drive.google.com/file/d/1d6OWzYWjzL772uAbkFGmpPDqiWJtrGL8/view?usp=sharing)**

The demo showcases:
- Creating an on-chain vault via the web app
- Saving a password entry (Seal encrypt → Walrus upload → Sui transaction)
- The browser extension auto-detecting a registration form and prompting to save
- Decrypting and auto-filling credentials using wallet signature

---

## The Problem

Traditional password managers rely on centralized infrastructure, creating critical risks:

| Risk | Impact |
|------|--------|
| Single point of failure | One breach exposes all users |
| Vendor lock-in | Data trapped behind subscriptions |
| No true ownership | Provider can read or revoke access |
| Centralized key management | Trust shifted to a third party |

If a centralized provider is breached or shut down, users lose access to all their critical credentials.

---

## The Solution

SealVault replaces the centralized trust model with cryptographic ownership:

```
Credentials → Seal SDK (threshold encrypt) → Walrus (decentralized storage)
                                                      ↓
                            blobId recorded on Sui blockchain (Move smart contract)

Decryption: wallet signature → key servers verify ownership on-chain → return key shares
                                → reconstruct decryption key locally → plaintext never leaves device
```

### Key Guarantees
- Only your wallet can decrypt your passwords — even Mysten Labs cannot
- Passwords are never stored in plaintext anywhere, including on-chain
- Threshold decryption requires 2-of-11 independent key servers to respond
- No backend — the web app calls Sui RPC and Walrus directly

---

## Core Features

### Web App (`/client`)
- **Create On-Chain Vault** — one-time Sui transaction, generates a `VaultRegistry` object
- **Add Password Entry** — encrypts `{username, password}` with Seal, uploads to Walrus, stores `blobId` on-chain
- **Reveal Passwords** — wallet-signature-gated decryption flow
- **Delete Entries** — on-chain removal via Move call
- **Search & Filter** — by site name, username, or category
- **Password Generator** — built-in configurable password generator with strength meter

### Browser Extension (`/extension`)
- **Auto-Save Banner** — detects form submissions on any website and prompts to save credentials
- **Auto-Fill Dropdown** — appears on password fields; one click decrypts and fills credentials
- **Works on any site** — pure DOM injection, no site-specific configuration required
- **Wallet Bridge** — connects to installed Sui wallets (Slush, Sui Wallet, etc.) via the Wallet Standard

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser Extension                  │
│                                                     │
│  injected.ts        content/index.ts    background/ │
│  (MAIN world)       (Isolated world)    (Service    │
│                                          Worker)    │
│  • Wallet access    • UI / banners      • Seal SDK  │
│  • Sign TX          • Form intercept    • Walrus    │
│  • Sign message     • postMessage       • TX build  │
│        ↕ postMessage       ↕ chrome.runtime.sendMessage
└─────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────┐
│              Web App (Next.js client)                │
│  • Vault management UI                              │
│  • dapp-kit wallet integration                      │
│  • Seal SDK (encrypt / decrypt)                     │
│  • Walrus API (proxied via Next.js routes)          │
└─────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────┐
│                   Sui Blockchain                     │
│  Move Package: vault.move + vault_policy.move       │
│  • VaultRegistry object (owned by user wallet)      │
│  • add_entry / remove_entry / seal_approve          │
└─────────────────────────────────────────────────────┘
                            ↕
┌──────────────────────────┐  ┌────────────────────────┐
│   Walrus Decentralized   │  │   Seal Key Servers     │
│   Storage (11 nodes)     │  │   (11 nodes, t=2)      │
│   Stores ciphertext      │  │   Hold key shares for  │
│   blob_id on-chain       │  │   threshold decryption │
└──────────────────────────┘  └────────────────────────┘
```

---

## Save & Decrypt Flow

### Saving a Password
```
1. JSON.stringify({ username, password })
2. Seal SDK encrypts with threshold(2/11) under vault identity
3. Ciphertext uploaded to Walrus → returns blobId
4. Move TX: vault::add_entry(vaultId, siteName, username_hint, blobId)
5. User signs TX with wallet → confirmed on Sui
```

### Decrypting a Password (Reveal / Auto-fill)
```
1. Fetch ciphertext from Walrus using blobId
2. Create ephemeral SessionKey (10-min TTL)
3. User signs session key message with wallet (proves ownership)
4. Build seal_approve PTB → send to 11 key servers (never broadcast)
5. Key servers verify vault ownership on-chain → return key shares
6. Combine 2+ shares locally → reconstruct decryption key
7. Decrypt ciphertext → { username, password }
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Sui Move (`vault.move`, `vault_policy.move`) |
| Frontend | Next.js 14, React, TailwindCSS, Framer Motion |
| Wallet Integration | `@mysten/dapp-kit`, Wallet Standard |
| Encryption | Seal SDK (`@mysten/seal`) — threshold encryption |
| Decentralized Storage | Walrus Protocol (testnet) |
| Browser Extension | Chrome Extension MV3, TypeScript, Vite |
| Sui RPC | `@mysten/sui` v2 (`SuiJsonRpcClient`) |

---

## Deployment

| Component | Details |
|-----------|---------|
| Network | Sui Testnet |
| Package ID | `0x041e334f5ed9d07b2703921b388500c5c08b6952e40b4db893faf59e4045d477` |
| Walrus | `walrus-testnet.walrus.space` |

---

## Running Locally

### Prerequisites
- Node.js 18+
- A Sui wallet browser extension (Slush or Sui Wallet)
- Sui Testnet SUI tokens (for gas)

### 1. Web App

```bash
cd client
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_PACKAGE_ID
npm run dev
# → http://localhost:3000
```

### 2. Browser Extension

```bash
cd extension
npm install
npm run build
# Load dist/ folder in chrome://extensions (Developer Mode → Load unpacked)
```

---

## Project Structure

```
seal-vault/
├── client/                  # Next.js web app
│   └── src/
│       ├── app/vault/       # Main vault UI page
│       └── lib/
│           ├── seal.ts      # Seal SDK encrypt/decrypt
│           ├── walrus.ts    # Walrus upload/download
│           ├── contract.ts  # Move TX builders
│           └── config.ts    # Environment config
├── extension/               # Chrome Extension MV3
│   └── src/
│       ├── content/
│       │   ├── index.ts     # Isolated world: UI + form intercept
│       │   └── injected.ts  # MAIN world: wallet bridge
│       └── background/
│           └── index.ts     # Service worker: Seal + Walrus + TX
└── sealvault/               # Sui Move package
    └── sources/
        ├── vault.move       # VaultRegistry + add/remove entry
        └── vault_policy.move # seal_approve access control
```

---

## Security Model

- **Zero-knowledge storage**: Walrus stores only ciphertext; key servers never see plaintext
- **On-chain access control**: `vault_policy::seal_approve` verifies vault ownership via Move
- **Threshold encryption**: 2-of-11 key servers required — no single point of compromise
- **No extension plaintext storage**: passwords never written to `localStorage` or `chrome.storage`
- **Session keys**: ephemeral 10-minute keypairs used for decryption; invalidated after use

---

*SealVault — Your keys, your vault, your rules.*
