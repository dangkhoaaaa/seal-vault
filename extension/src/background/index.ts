/**
 * ExtVault Background Service Worker
 *
 * Logic copied from the working Next.js client (client/src/lib/seal.ts,
 * client/src/lib/walrus.ts, client/src/lib/contract.ts).
 *
 * KEY FIX vs old extension:
 *   sealEncrypt ID = PACKAGE_ID (no 0x) + vaultId (no 0x)   ← client formula
 *   Old broken extension used only vaultId — that's why encrypt/decrypt failed.
 *
 * Architecture:
 *   - Seal encrypt/decrypt + Walrus upload/download + TX building → here (bg)
 *   - Wallet signing (personal msg + TX) → MAIN world (injected.ts)
 *   - UI / form intercept / banners → isolated content script (content/index.ts)
 */

import { SealClient, SessionKey, EncryptedObject } from '@mysten/seal';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction }   from '@mysten/sui/transactions';

// ─── Build stamp ──────────────────────────────────────────────────────────────
const BUILD = 'extvault-v1-' + '2026-04-19';
console.log(`[ExtVault BG] ✅ loaded — ${BUILD}`);

// ─── Config (mirror client/.env.local + lib/config.ts) ───────────────────────
const PACKAGE_ID   = '0x041e334f5ed9d07b2703921b388500c5c08b6952e40b4db893faf59e4045d477';
const VAULT_MODULE = 'vault';
const VAULT_POLICY = 'vault_policy';
const SUI_RPC      = 'https://fullnode.testnet.sui.io:443';
const WALRUS_PUB   = 'https://publisher.walrus-testnet.walrus.space/v1';
const WALRUS_AGG   = 'https://aggregator.walrus-testnet.walrus.space/v1';
const SESSION_TTL  = 10; // minutes
const ONE_DAY_MS   = 24 * 60 * 60 * 1000;

// ─── Key servers (identical to client/src/lib/seal.ts) ───────────────────────
const KEY_SERVERS = [
  { objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98', aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com', weight: 1 },
  { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
  { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
  { objectId: '0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2', weight: 1 },
  { objectId: '0x5466b7df5c15b508678d51496ada8afab0d6f70a01c10613123382b1b8131007', weight: 1 },
  { objectId: '0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2', weight: 1 },
  { objectId: '0x9c949e53c36ab7a9c484ed9e8b43267a77d4b8d70e79aa6b39042e3d4c434105', weight: 1 },
  { objectId: '0x39cef09b24b667bc6ed54f7159d82352fe2d5dd97ca9a5beaa1d21aa774f25a2', weight: 1 },
  { objectId: '0x4cded1abeb52a22b6becb42a91d3686a4c901cf52eee16234214d0b5b2da4c46', weight: 1 },
  { objectId: '0x3c93ec1474454e1b47cf485a4e5361a5878d722b9492daf10ef626a76adc3dad', weight: 1 },
  { objectId: '0x6a0726a1ea3d62ba2f2ae51104f2c3633c003fb75621d06fde47f04dc930ba06', weight: 1 },
];

// ─── Sui clients ──────────────────────────────────────────────────────────────

/**
 * SuiJsonRpcClient — used everywhere (queries, TX building, Seal SDK).
 * In @mysten/sui v2, this is the recommended client that exposes `.core`
 * which the Seal SDK v1.1.1 requires.
 * (Same pattern as client/src/lib/seal.ts → makeSuiClient())
 */
function makeSuiClient() {
  return new SuiJsonRpcClient({ url: SUI_RPC, network: 'testnet' }) as any;
}

/** Convert a hex string to Uint8Array without requiring Node.js Buffer. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Module-level session key cache.
 *
 * The Seal decrypt flow is split across two separate chrome.runtime.sendMessage calls:
 *   1. GET_SESSION_KEY_MESSAGE  — creates SessionKey, returns personalMsg bytes for signing
 *   2. DECRYPT_ENTRY            — receives the wallet signature, decrypts
 *
 * The SessionKey object MUST be reused between these two calls because it contains
 * an ephemeral keypair. Creating a new SessionKey in step 2 gives a different
 * keypair → the signature from step 1 becomes invalid → "Not valid" error.
 *
 * Keyed by walletAddress so concurrent users don't collide.
 * Entries are deleted immediately after use (one-shot).
 */
const sessionKeyCache = new Map<string, SessionKey>();

// ─── Walrus (direct, no proxy — bg worker can hit external endpoints) ─────────
async function walrusUpload(data: Uint8Array): Promise<string> {
  const resp = await fetch(`${WALRUS_PUB}/blobs?epochs=3`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data.buffer as ArrayBuffer,
  });
  if (!resp.ok) throw new Error(`Walrus upload: ${resp.status} ${await resp.text()}`);
  const json = await resp.json();
  const blobId = json.alreadyCertified?.blobId ?? json.newlyCreated?.blobObject?.blobId;
  if (!blobId) throw new Error('Walrus: no blobId in response');
  return blobId;
}

async function walrusDownload(blobId: string): Promise<Uint8Array> {
  const resp = await fetch(`${WALRUS_AGG}/blobs/${blobId}`);
  if (!resp.ok) throw new Error(`Walrus download: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

// ─── Seal encrypt ─────────────────────────────────────────────────────────────
/**
 * Encrypt data under the vault's Seal identity.
 *
 * CRITICAL: id = PACKAGE_ID (no 0x) + vaultId (no 0x)
 * This matches exactly what client/src/lib/seal.ts → sealEncrypt() does.
 * The old extension only used vaultId — that caused decrypt to fail because
 * the encryption ID didn't match the policy the key servers expect.
 */
async function sealEncrypt(vaultId: string, data: Uint8Array): Promise<Uint8Array> {
  const id = `${PACKAGE_ID.replace(/^0x/, '')}${vaultId.replace(/^0x/, '')}`;
  console.log('[ExtVault BG] sealEncrypt id prefix:', id.slice(0, 16) + '…');

  const client = new SealClient({
    suiClient: makeSuiClient(),
    serverConfigs: KEY_SERVERS,
    verifyKeyServers: false,
  });

  const { encryptedObject } = await client.encrypt({
    threshold: 2,
    packageId: PACKAGE_ID,
    id,
    data,
  });

  return encryptedObject;
}

// ─── Seal decrypt ─────────────────────────────────────────────────────────────
/**
 * Decrypt a Seal-encrypted blob.
 *
 * Takes the SAME SessionKey object that was used to generate the personal message
 * bytes — passed in from the cache so the ephemeral keypair is consistent.
 */
async function sealDecrypt(
  sessionKey: SessionKey,       // must be the cached instance from GET_SESSION_KEY_MESSAGE
  vaultRef: { objectId: string; version: string; digest: string },
  encryptedData: Uint8Array,
  personalMessageSignature: string,
): Promise<Uint8Array> {
  const internalClient = makeSuiClient();

  const sealSdkClient = new SealClient({
    suiClient: internalClient,
    serverConfigs: KEY_SERVERS,
    verifyKeyServers: false,
  });

  // Set the wallet's signature on the existing session key (same ephemeral keypair)
  await sessionKey.setPersonalMessageSignature(personalMessageSignature);

  const id = EncryptedObject.parse(encryptedData).id;
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::${VAULT_POLICY}::seal_approve`,
    arguments: [
      tx.pure.vector('u8', Array.from(hexToBytes(id))),
      tx.objectRef(vaultRef),
    ],
  });

  const txBytes = await tx.build({ client: internalClient, onlyTransactionKind: true });

  return sealSdkClient.decrypt({
    data: encryptedData,
    sessionKey,
    txBytes,
    checkLEEncoding: true,
  });
}

// ─── Vault lookup ─────────────────────────────────────────────────────────────
async function getVaultForAddress(address: string) {
  const client = makeSuiClient();
  const res = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: `${PACKAGE_ID}::${VAULT_MODULE}::VaultRegistry` },
    options: { showContent: true },
  });
  const obj = res.data[0];
  if (!obj?.data?.objectId) return null;
  return {
    objectId: obj.data.objectId,
    version:  obj.data.version  ?? '',
    digest:   obj.data.digest   ?? '',
    content:  obj.data.content,
  };
}

// ─── Build add_entry TX (unsigned bytes → sent to MAIN world for signing) ─────
async function buildAddEntryTx(
  senderAddress: string,
  vaultId: string,
  siteName: string,
  username: string,
  blobId: string,
  category: string,
  notes: string,
): Promise<Uint8Array> {
  const client = makeSuiClient();
  const tx = new Transaction();
  // Required by Sui SDK v2 when building TX bytes without a wallet signer
  tx.setSender(senderAddress);
  tx.moveCall({
    target: `${PACKAGE_ID}::${VAULT_MODULE}::add_entry`,
    arguments: [
      tx.object(vaultId),
      tx.pure.string(siteName),
      tx.pure.string(username),
      tx.pure.string(blobId),
      tx.pure.string(category),
      tx.pure.string(notes),
      tx.object('0x6'), // Clock
    ],
  });
  return tx.build({ client });
}

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // ── Save wallet session to storage ────────────────────────────────────────
  if (message.type === 'WALLET_STATUS') {
    chrome.storage.local.set({
      isConnected:   message.isConnected,
      walletAddress: message.walletAddress ?? null,
      walletName:    message.walletName    ?? null,
      expiresAt:     Date.now() + ONE_DAY_MS,
    });
    sendResponse({ success: true });
    return false;
  }

  // ── SAVE step 1: Seal encrypt + Walrus upload → blobId ───────────────────
  if (message.type === 'ENCRYPT_AND_UPLOAD') {
    (async () => {
      try {
        const { vaultId, username, password } = message;
        const payload   = new TextEncoder().encode(JSON.stringify({ username, password }));
        const encrypted = await sealEncrypt(vaultId, payload);
        const blobId    = await walrusUpload(encrypted);
        sendResponse({ success: true, blobId });
      } catch (e: any) {
        console.error('[ExtVault BG] ENCRYPT_AND_UPLOAD error:', e);
        sendResponse({ success: false, error: e?.message ?? String(e) });
      }
    })();
    return true; // async
  }

  // ── SAVE step 2: Build unsigned add_entry TX bytes → base64 ──────────────
  if (message.type === 'BUILD_ADD_ENTRY_TX') {
    (async () => {
      try {
        const txBytes = await buildAddEntryTx(
          message.address,                          // sender — required by Sui SDK v2
          message.vaultId,
          message.siteName ?? message.domain ?? '',
          message.username ?? '',
          message.blobId,
          message.category ?? 'other',
          message.notes    ?? 'Saved by extvault',
        );
        const b64 = btoa(String.fromCharCode(...txBytes));
        sendResponse({ success: true, txBase64: b64 });
      } catch (e: any) {
        sendResponse({ success: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  // ── AUTOFILL step 1: create session key → cache it → return personal message bytes
  if (message.type === 'GET_SESSION_KEY_MESSAGE') {
    (async () => {
      try {
        const internalClient = makeSuiClient();
        const sessionKey = await SessionKey.create({
          address:   message.walletAddress,
          packageId: PACKAGE_ID,
          ttlMin:    SESSION_TTL,
          suiClient: internalClient,
        });
        // CRITICAL: cache the object — DECRYPT_ENTRY must reuse the same instance
        sessionKeyCache.set(message.walletAddress, sessionKey);
        const personalMsg = sessionKey.getPersonalMessage();
        sendResponse({ success: true, personalMsg: Array.from(personalMsg) });
      } catch (e: any) {
        sendResponse({ success: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  // ── AUTOFILL step 2: Walrus download + Seal decrypt ───────────────────────
  if (message.type === 'DECRYPT_ENTRY') {
    (async () => {
      try {
        const { walletAddress, vaultRef, blobId, signature } = message;

        // Retrieve the cached SessionKey — it MUST be the same object from step 1
        const sessionKey = sessionKeyCache.get(walletAddress);
        if (!sessionKey) {
          throw new Error('Session key expired or not found. Please try again.');
        }
        // Do NOT delete immediately — caller may decrypt multiple entries in one batch.
        // Schedule cleanup after 60 s (the SessionKey itself has a 10-min TTL anyway).
        setTimeout(() => sessionKeyCache.delete(walletAddress), 60_000);

        const encrypted = await walrusDownload(blobId);

        // Validate it's a real Seal ciphertext (same guard as client vault/page.tsx)
        try { EncryptedObject.parse(encrypted); } catch {
          throw new Error('Entry cannot be decrypted — saved with an incompatible config.');
        }

        const decrypted = await sealDecrypt(sessionKey, vaultRef, encrypted, signature);
        const { username, password } = JSON.parse(new TextDecoder().decode(decrypted));
        sendResponse({ success: true, credentials: { username, password } });
      } catch (e: any) {
        console.error('[ExtVault BG] DECRYPT_ENTRY error:', e);
        sendResponse({ success: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }

  // ── Get vault info for wallet address ─────────────────────────────────────
  if (message.type === 'GET_VAULT') {
    (async () => {
      try {
        const vault = await getVaultForAddress(message.address);
        if (!vault) {
          sendResponse({ success: false, error: 'No vault found. Create one at the SealVault web app first.' });
          return;
        }
        const entries = (vault.content as any)?.fields?.entries ?? [];
        console.log('[ExtVault BG] GET_VAULT entries raw:', JSON.stringify(entries, null, 2));
        sendResponse({
          success: true,
          vault: { objectId: vault.objectId, version: vault.version, digest: vault.digest },
          entries,
        });
      } catch (e: any) {
        sendResponse({ success: false, error: e?.message ?? String(e) });
      }
    })();
    return true;
  }
});
