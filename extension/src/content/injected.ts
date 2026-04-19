/**
 * SealVault — MAIN WORLD injected script (lightweight)
 *
 * THIS SCRIPT ONLY HANDLES WALLET OPERATIONS:
 *   - Detect installed Sui wallets
 *   - Connect wallet
 *   - Sign personal messages (session key for Seal decrypt)
 *   - Sign and execute transactions (add_entry on-chain)
 *
 * Heavy operations (Seal encrypt/decrypt, Walrus upload/download, TX building)
 * are handled by the background service worker via chrome.runtime.sendMessage
 * from the isolated content script (index.ts).
 *
 * No @mysten/seal imports here — that SDK has incompatibilities in MAIN world.
 */

import { getWallets } from '@wallet-standard/core';

const { get, on } = getWallets();
on('register',   () => sendWalletList());
on('unregister', () => sendWalletList());

function getSuiWallets() {
  return get().filter(w =>
    'standard:connect' in w.features &&
    w.chains.some(c => c.startsWith('sui:'))
  );
}

function sendWalletList() {
  const wallets = getSuiWallets().map(w => ({ name: w.name, icon: w.icon }));
  window.postMessage({ source: 'SV_MAIN', type: 'WALLETS_LIST', wallets }, '*');
}

function getWallet(name: string) {
  const all = getSuiWallets();
  return all.find(w => w.name === name)
    ?? all.find(w => w.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(w.name.toLowerCase()))
    ?? (all.length > 0 ? (console.warn(`SealVault: wallet "${name}" not found, using "${all[0].name}"`), all[0]) : null);
}

async function ensureConnected(wallet: any) {
  const result = await (wallet.features['standard:connect'] as any).connect({ silent: true });
  const account = result.accounts?.[0];
  if (!account) throw new Error('No account found. Please connect your wallet.');
  return account;
}

window.addEventListener('message', async (event) => {
  if (!event.data?.source || event.data.source !== 'SV_ISOLATED') return;
  const { type } = event.data;

  // ── Detect available wallets ─────────────────────────────────────────────
  if (type === 'DETECT_WALLETS') {
    sendWalletList();
    return;
  }

  // ── Connect wallet ────────────────────────────────────────────────────────
  if (type === 'CONNECT_WALLET') {
    const wallet = getWallet(event.data.walletName);
    if (!wallet) {
      window.postMessage({ source: 'SV_MAIN', type: 'CONNECT_RESULT', success: false, error: 'Wallet not found' }, '*');
      return;
    }
    try {
      const result = await (wallet.features['standard:connect'] as any).connect({ silent: false });
      const address = result.accounts?.[0]?.address ?? null;
      window.postMessage({ source: 'SV_MAIN', type: 'CONNECT_RESULT', success: true, address, walletName: wallet.name }, '*');
    } catch (e: any) {
      window.postMessage({ source: 'SV_MAIN', type: 'CONNECT_RESULT', success: false, error: e?.message ?? 'Connection rejected' }, '*');
    }
    return;
  }

  // ── Sign and execute a pre-built base64 transaction ────────────────────
  // Used for: vault::add_entry (save), vault::remove_entry (delete)
  if (type === 'SIGN_AND_EXECUTE_TX') {
    const wallet = getWallet(event.data.walletName);
    if (!wallet) {
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_TX_RESULT', success: false, error: 'Wallet not found' }, '*');
      return;
    }
    try {
      const account = await ensureConnected(wallet);
      const feature = (wallet.features['sui:signAndExecuteTransaction']
        ?? wallet.features['sui:signAndExecuteTransactionBlock']) as any;
      if (!feature) throw new Error('Wallet does not support signAndExecuteTransaction');
      const result = await feature.signAndExecuteTransaction({
        transaction: { toJSON: async () => event.data.txBase64 },
        account,
        chain: `sui:testnet`,
      });
      const digest = result?.digest ?? result?.effects?.transactionDigest ?? '';
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_TX_RESULT', success: true, digest }, '*');
    } catch (e: any) {
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_TX_RESULT', success: false, error: e?.message ?? String(e) }, '*');
    }
    return;
  }

  // ── Sign personal message (for Seal session key) ─────────────────────────
  if (type === 'SIGN_PERSONAL_MESSAGE') {
    const wallet = getWallet(event.data.walletName);
    if (!wallet) {
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_MSG_RESULT', success: false, error: 'Wallet not found' }, '*');
      return;
    }
    try {
      const account   = await ensureConnected(wallet);
      const feature   = wallet.features['sui:signPersonalMessage'] as any;
      if (!feature) throw new Error('Wallet does not support signPersonalMessage');
      const msgBytes  = new Uint8Array(event.data.personalMsg as number[]);
      const { signature } = await feature.signPersonalMessage({ message: msgBytes, account });
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_MSG_RESULT', success: true, signature }, '*');
    } catch (e: any) {
      window.postMessage({ source: 'SV_MAIN', type: 'SIGN_MSG_RESULT', success: false, error: e?.message ?? String(e) }, '*');
    }
    return;
  }

  // ── Get wallet address (silent connect) ───────────────────────────────────
  if (type === 'GET_WALLET_ADDRESS') {
    const wallet = getWallet(event.data.walletName);
    if (!wallet) {
      window.postMessage({ source: 'SV_MAIN', type: 'WALLET_ADDRESS_RESULT', success: false }, '*');
      return;
    }
    try {
      const account = await ensureConnected(wallet);
      window.postMessage({ source: 'SV_MAIN', type: 'WALLET_ADDRESS_RESULT', success: true, address: account.address }, '*');
    } catch {
      window.postMessage({ source: 'SV_MAIN', type: 'WALLET_ADDRESS_RESULT', success: false }, '*');
    }
    return;
  }
});

console.log('SealVault main-world bridge active (wallet-only mode)');
