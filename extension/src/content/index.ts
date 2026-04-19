/**
 * ExtVault — Content Script (Isolated World)
 *
 * Two features, zero popup:
 *
 * 1. AUTO-SAVE BANNER
 *    Detects when a login form is submitted / password field blurred with a value.
 *    Shows a "Save to extvault?" banner → user clicks Save → in-page modal walks
 *    through the Seal+Walrus+TX signing flow.
 *
 * 2. AUTO-FILL DROPDOWN
 *    When user focuses an input[type="password"] a small "🔐 Unlock & Auto-fill"
 *    dropdown appears. Clicking it opens the in-page modal to decrypt & fill.
 *
 * All heavy crypto (Seal, Walrus, TX building) is done in background/index.ts.
 * Wallet signing is done in MAIN world (injected.ts) via postMessage bridge.
 *
 * The UI is pure vanilla DOM — no React — because content scripts run in the
 * context of arbitrary pages and React would conflict.
 */

console.log('[extvault] content script loaded');

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ev-style')) return;
  const s = document.createElement('style');
  s.id = 'ev-style';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    @keyframes ev-in  { from { opacity:0; transform:translateY(-10px) scale(0.96) } to { opacity:1; transform:none } }
    @keyframes ev-out { from { opacity:1 } to { opacity:0 } }
    @keyframes ev-spin { to { transform:rotate(360deg) } }

    #ev-overlay, #ev-banner, .ev-dropdown {
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
      box-sizing: border-box !important;
    }
    #ev-overlay *, #ev-banner *, .ev-dropdown * { box-sizing: border-box !important; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function $(id: string) { return document.getElementById(id); }

function spinner(color = '#818cf8') {
  return `<svg style="animation:ev-spin 0.7s linear infinite;flex-shrink:0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3">
    <circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
  </svg>`;
}

function shieldIcon(color = '#818cf8', size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-PAGE MODAL
// ─────────────────────────────────────────────────────────────────────────────
type ModalPurpose = 'autofill' | 'save';
interface ModalResult {
  signed: boolean;
  credentials?: { username: string; password: string };
}

interface SaveData { domain: string; username: string; password: string; }

function showModal(
  purpose: ModalPurpose,
  saveData?: SaveData,
  typedUsername?: string,   // email/user already typed in the username field
): Promise<ModalResult> {
  return new Promise((resolve) => {
    injectStyles();
    $('ev-overlay')?.remove();

    // ── Overlay
    const overlay = document.createElement('div');
    overlay.id = 'ev-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;
      background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;
    `;

    // ── Card
    const card = document.createElement('div');
    card.style.cssText = `
      position:relative;width:380px;max-width:calc(100vw - 32px);
      background:#FFFFFF;
      border:3px solid #000;border-radius:16px;
      box-shadow:8px 8px 0px #000;
      overflow:hidden;animation:ev-in 0.22s cubic-bezier(.16,1,.3,1);color:#000;
    `;

    // ── Header
    const header = document.createElement('div');
    header.style.cssText = `
      display:flex;align-items:center;justify-content:space-between;
      padding:16px 20px;background:#eefcdc;
      border-bottom:3px solid #000;
    `;
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:16px;font-weight:900;color:#000;letter-spacing:-0.01em;text-transform:uppercase;">
          extvault — ${purpose === 'autofill' ? 'Auto-fill' : 'Save Password'}
        </span>
      </div>
      <button id="ev-close" style="background:none;border:none;color:#000;cursor:pointer;
        font-size:22px;line-height:1;padding:4px 6px;border-radius:8px;transition:transform 0.15s;font-weight:900;" title="Close">✕</button>
    `;

    // ── Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:22px 22px 20px;';

    const statusArea = document.createElement('div');
    statusArea.id = 'ev-status';

    const descBox = document.createElement('div');
    descBox.style.cssText = `
      display:flex;gap:12px;align-items:flex-start;
      background:#fcf482;border:2px solid #000;box-shadow:4px 4px 0 #000;
      border-radius:12px;padding:14px;margin-bottom:24px;
    `;
    descBox.innerHTML = `
      <div>
        <p style="font-size:14px;font-weight:800;color:#000;margin:0 0 4px;text-transform:uppercase;">
          ${purpose === 'autofill' ? 'Decrypt & fill' : 'Encrypt & save'}
        </p>
        <p style="font-size:13px;color:#000;margin:0;line-height:1.6;font-weight:600;">
          ${purpose === 'autofill'
            ? 'Wallet signature required to decrypt.'
            : `Store on Walrus for <strong style="color:#000;text-decoration:underline;">${saveData?.domain ?? location.hostname}</strong>`
          }
        </p>
      </div>
    `;

    // ── Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'ev-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      flex:1;background:#fff;border:2px solid #000;color:#000;
      padding:12px;border-radius:12px;cursor:pointer;font-size:14px;font-weight:800;
      transition:all 0.15s;font-family:inherit;box-shadow:3px 3px 0 #000;text-transform:uppercase;
    `;

    const actionBtn = document.createElement('button');
    actionBtn.id = 'ev-sign';
    actionBtn.textContent = purpose === 'autofill' ? 'Sign & Fill' : 'Sign & Save';
    actionBtn.style.cssText = `
      flex:2;background:#93fca1;border:2px solid #000;color:#000;
      padding:12px;border-radius:12px;cursor:pointer;font-size:14px;font-weight:800;
      transition:all 0.15s;box-shadow:4px 4px 0 #000;font-family:inherit;text-transform:uppercase;
    `;

    cancelBtn.onmouseenter = () => { cancelBtn.style.transform = 'translate(-1px,-1px)'; cancelBtn.style.boxShadow = '4px 4px 0 #000'; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.transform = 'none'; cancelBtn.style.boxShadow = '3px 3px 0 #000'; };
    actionBtn.onmouseenter = () => { actionBtn.style.transform = 'translate(-2px,-2px)'; actionBtn.style.boxShadow = '6px 6px 0 #000'; actionBtn.style.background = '#a4fcae'; };
    actionBtn.onmouseleave = () => { actionBtn.style.transform = 'none'; actionBtn.style.boxShadow = '4px 4px 0 #000'; actionBtn.style.background = '#93fca1'; };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(actionBtn);
    body.appendChild(statusArea);
    body.appendChild(descBox);
    body.appendChild(btnRow);
    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // ── State helpers ──────────────────────────────────────────────────────
    function setStatus(html: string) {
      const el = $('ev-status');
      if (el) el.innerHTML = html;
    }

    function setStep(msg: string) {
      setStatus(`
        <div style="display:flex;align-items:center;gap:8px;background:#f3f4f6;
          border:2px solid #000;border-radius:10px;padding:10px 12px;margin-bottom:14px;box-shadow:2px 2px 0 #000;">
          ${spinner('#000')}
          <span style="font-size:13px;color:#000;font-weight:600;">${msg}</span>
        </div>
      `);
    }

    function setErr(msg: string) {
      setStatus(`
        <div style="background:#ffe4e4;border:2px solid #000;box-shadow:3px 3px 0 #000;
          border-radius:10px;padding:10px 14px;margin-bottom:14px;">
          <span style="font-size:13px;color:#000;font-weight:700;">${msg}</span>
        </div>
      `);
    }

    function setLoading(loading: boolean) {
      const btn = $('ev-sign') as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = loading;
      btn.style.opacity = loading ? '0.6' : '1';
      btn.style.cursor  = loading ? 'not-allowed' : 'pointer';
      if (loading) {
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:7px;">
          ${spinner('#000')} Signing…</span>`;
      } else {
        btn.textContent = purpose === 'autofill' ? 'Sign & Fill' : 'Sign & Save';
      }
    }

    // ── Wallet detection ──────────────────────────────────────────────────
    let connectedWalletName: string | null = null;
    let connectedAddress: string | null = null;    // cached when wallet connects
    let walletList: { name: string; icon: string }[] = [];

    function renderWalletList() {
      if (walletList.length === 0) {
        setStatus(`
          <div style="background:#ffe4e4;border:2px solid #000;box-shadow:3px 3px 0 #000;border-radius:10px;padding:14px;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              <span style="font-size:13px;color:#000;font-weight:800;text-transform:uppercase;">No Sui wallet detected</span>
            </div>
            <p style="font-size:12px;color:#000;margin:0;font-weight:600;">Install Slush, Sui Wallet, or another Sui wallet extension.</p>
          </div>
        `);
        const btn = $('ev-sign') as HTMLButtonElement | null;
        if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; }
        return;
      }

      const items = walletList.map(w => `
        <button class="ev-wallet" data-name="${w.name}" style="
          width:100%;background:#8795fc;border:2px solid #000;color:#000;
          border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;box-shadow:2px 2px 0 #000;
          display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;
          transition:all 0.15s;text-align:left;font-family:inherit;
        ">
          <img src="${w.icon}" style="width:22px;height:22px;border-radius:5px;border:1px solid #000;" />
          ${w.name}
        </button>
      `).join('');

      setStatus(`
        <div style="margin-bottom:16px;">
          <p style="font-size:11px;color:#000;font-weight:800;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;">Choose wallet</p>
          ${items}
        </div>
      `);
      const btn = $('ev-sign') as HTMLButtonElement | null;
      if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; }

      setTimeout(() => {
        $('ev-status')?.querySelectorAll<HTMLElement>('.ev-wallet').forEach(el => {
          el.onmouseenter = () => { el.style.background = '#9da8ff'; el.style.transform = 'translate(-2px,-2px)'; el.style.boxShadow = '4px 4px 0 #000'; };
          el.onmouseleave = () => { el.style.background = '#8795fc'; el.style.transform = 'none'; el.style.boxShadow = '2px 2px 0 #000'; };
          el.addEventListener('click', () => {
            el.innerHTML = `<span style="display:flex;align-items:center;gap:8px;width:100%;">${spinner('#000')} Connecting…</span>`;
            window.postMessage({ source: 'SV_ISOLATED', type: 'CONNECT_WALLET', walletName: el.dataset.name! }, '*');
          });
        });
      }, 50);
    }

    function renderConnected(name: string, address: string) {
      connectedWalletName = name;
      connectedAddress    = address;   // ← cache here for direct use in sign handler
      const short = address ? address.slice(0, 6) + '\u2026' + address.slice(-4) : '';
      setStatus(`
        <div style="display:flex;align-items:center;gap:8px;background:#93fca1;
          border:2px solid #000;border-radius:10px;padding:10px 12px;margin-bottom:14px;box-shadow:2px 2px 0 #000;">
          <span style="font-size:13px;color:#000;font-weight:800;">${name}</span>
          <span style="font-size:12px;color:#000;margin-left:auto;font-family:monospace;font-weight:700;">${short}</span>
        </div>
      `);
      chrome.runtime.sendMessage({ type: 'WALLET_STATUS', isConnected: true, walletAddress: address, walletName: name });
      const btn = $('ev-sign') as HTMLButtonElement | null;
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
    }

    // ── Bridge listener ────────────────────────────────────────────────────
    const bridgeListener = (evt: MessageEvent) => {
      if (evt.data?.source !== 'SV_MAIN') return;

      if (evt.data.type === 'WALLETS_LIST') {
        walletList = evt.data.wallets ?? [];
        chrome.storage.local.get(['isConnected', 'walletAddress', 'walletName', 'expiresAt'], (d) => {
          if (d.isConnected && d.walletName && d.walletAddress && d.expiresAt && Date.now() < d.expiresAt) {
            // Optimistically show as connected using stored address.
            // Simultaneously verify with MAIN world — only reset if explicitly denied.
            // Do NOT use a timeout-based fallback (causes flicker on slow connections).
            renderConnected(d.walletName ?? 'Wallet', d.walletAddress);

            const verifyListener = (ve: MessageEvent) => {
              if (ve.data?.source !== 'SV_MAIN' || ve.data.type !== 'WALLET_ADDRESS_RESULT') return;
              window.removeEventListener('message', verifyListener);
              if (ve.data.success && ve.data.address) {
                // Update with fresh address (may differ from stored)
                renderConnected(d.walletName ?? 'Wallet', ve.data.address);
              } else {
                // Wallet explicitly denied access on this domain — force reconnect
                chrome.storage.local.remove(['isConnected', 'walletAddress', 'walletName', 'expiresAt']);
                connectedAddress = null; connectedWalletName = null;
                renderWalletList();
              }
            };
            window.addEventListener('message', verifyListener);
            window.postMessage({ source: 'SV_ISOLATED', type: 'GET_WALLET_ADDRESS', walletName: d.walletName }, '*');
          } else {
            renderWalletList();
          }
        });
      }

      if (evt.data.type === 'CONNECT_RESULT') {
        if (evt.data.success) {
          renderConnected(evt.data.walletName, evt.data.address);
        } else {
          setErr('Connection rejected. Try again.');
          setTimeout(() => renderWalletList(), 1500);
        }
      }

      if (evt.data.type === 'SIGN_TX_RESULT') {
        if (evt.data.success) {
          console.log('[extvault] saved on-chain, digest:', evt.data.digest);
          closeModal({ signed: true });
        } else {
          setLoading(false);
          const errMsg = evt.data.error ?? 'unknown';
          setErr(`TX rejected: ${errMsg}`);
          // If the wallet lost its account (e.g. not connected on this domain), reset UI
          if (errMsg.toLowerCase().includes('account') || errMsg.toLowerCase().includes('connect')) {
            chrome.storage.local.remove(['isConnected', 'walletAddress', 'walletName', 'expiresAt']);
            connectedAddress    = null;
            connectedWalletName = null;
            setTimeout(() => renderWalletList(), 2000);
          }
        }
      }
    };

    window.addEventListener('message', bridgeListener);

    // Detect timeout fallback
    const detectTimeout = setTimeout(() => {
      console.warn('[extvault] WALLETS_LIST timeout — showing manual connect');
      setErr('Wallet bridge timed out. Make sure a Sui wallet extension is installed and the page was refreshed.');
    }, 4000);

    const timeoutClearer = (evt: MessageEvent) => {
      if (evt.data?.source === 'SV_MAIN' && evt.data.type === 'WALLETS_LIST') {
        clearTimeout(detectTimeout);
        window.removeEventListener('message', timeoutClearer);
      }
    };
    window.addEventListener('message', timeoutClearer);

    // Loading state while detecting wallets
    setStatus(`
      <div style="display:flex;align-items:center;gap:8px;background:#fcf482;
        border:2px solid #000;border-radius:10px;padding:10px 12px;margin-bottom:14px;box-shadow:2px 2px 0 #000;">
        ${spinner('#000')} <span style="font-size:13px;color:#000;font-weight:700;">Detecting wallets…</span>
      </div>
    `);
    const signBtnInit = $('ev-sign') as HTMLButtonElement | null;
    if (signBtnInit) { signBtnInit.disabled = true; signBtnInit.style.opacity = '0.4'; }

    window.postMessage({ source: 'SV_ISOLATED', type: 'DETECT_WALLETS' }, '*');

    // ── Close ──────────────────────────────────────────────────────────────
    function closeModal(result: ModalResult) {
      window.removeEventListener('message', bridgeListener);
      overlay.style.transition = 'opacity 0.15s';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 160);
      resolve(result);
    }

    $('ev-close')?.addEventListener('click',  () => closeModal({ signed: false }));
    cancelBtn.addEventListener('click',        () => closeModal({ signed: false }));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal({ signed: false }); });

    // ── Sign button ──────────────────────────────────────────────────────
    actionBtn.addEventListener('click', () => {
      if (!connectedWalletName) return;
      setLoading(true);

      if (purpose === 'autofill') {
        // AUTOFILL FLOW:
        // 1. Use cached wallet address (set when user connected wallet)
        // 2. GET_VAULT → get all entries
        // 3. Sign once with wallet (session key)
        // 4. Decrypt each candidate entry → get { username, password }
        // 5. Find the one whose username matches what user typed
        // 6. Fill password (and username if field is empty)

        const address = connectedAddress;
        if (!address) {
          setLoading(false);
          setErr('Wallet not connected. Please connect first.');
          return;
        }

        setStep('Looking up vault…');
        chrome.runtime.sendMessage({ type: 'GET_VAULT', address }, (vaultResp) => {
          if (!vaultResp?.success) {
            setLoading(false); setErr(vaultResp?.error ?? 'No vault found'); return;
          }
            const vault: any  = vaultResp.vault;
            const entries: any[] = vaultResp.entries ?? [];
            const domain  = location.hostname;
            const typed   = (typedUsername ?? '').trim().toLowerCase();

            if (entries.length === 0) {
              setLoading(false);
              setErr('Your vault is empty. Save a password first.');
              return;
            }

            // ── Step 1: Filter by DOMAIN (always primary) ─────────────────────────
            // On facebook.com → only entries with site_name = facebook.com are relevant.
            // Entries from localhost, gmail, etc. are completely ignored.
            const domainEntries = entries.filter((e: any) => {
              const saved = (e.fields?.site_name ?? e.site_name ?? '').toLowerCase().trim();
              const cur   = domain.toLowerCase();
              if (!saved) return false;
              return cur === saved
                || cur.endsWith('.' + saved)
                || saved.endsWith('.' + cur)
                || (cur.includes(saved) && saved.includes('.'));
            });

            if (domainEntries.length === 0) {
              setLoading(false);
              setErr(`No saved password for <b>${domain}</b>. Save one first.`);
              return;
            }

            // ── Step 2: Filter by username_hint if user typed something ────────────
            let candidates: any[];
            if (typed) {
              const hintMatches = domainEntries.filter((e: any) => {
                const hint = (e.fields?.username_hint ?? '').toLowerCase().trim();
                return hint === typed;
              });
              if (hintMatches.length === 0) {
                setLoading(false);
                setErr(`No saved password for <b>${typed}</b> on ${domain}. Save one first.`);
                return;
              }
              candidates = hintMatches;
            } else {
              candidates = domainEntries;
            }

            setStep('Preparing session key…');
            chrome.runtime.sendMessage({ type: 'GET_SESSION_KEY_MESSAGE', walletAddress: address }, (skResp) => {
              if (!skResp?.success) {
                setLoading(false); setErr(`Session key error: ${skResp?.error}`); return;
              }

              setStep('Sign with wallet to decrypt…');
              window.postMessage({
                source: 'SV_ISOLATED',
                type:   'SIGN_PERSONAL_MESSAGE',
                walletName: connectedWalletName,
                personalMsg: skResp.personalMsg,
              }, '*');

              const sigListener = (sigEv: MessageEvent) => {
                if (sigEv.data?.source !== 'SV_MAIN' || sigEv.data.type !== 'SIGN_MSG_RESULT') return;
                window.removeEventListener('message', sigListener);

                if (!sigEv.data.success) {
                  setLoading(false); setErr('Signature rejected'); return;
                }

                // Decrypt all candidates sequentially, find username match
                setStep(`Decrypting ${candidates.length} entr${candidates.length > 1 ? 'ies' : 'y'}…`);

                let idx = 0;
                function decryptNext() {
                  if (idx >= candidates.length) {
                    // Tried all — no match found
                    setLoading(false);
                    if (typed) {
                      setErr(`No saved password for <b>${typed}</b>.`);
                    } else {
                      setErr(`No saved password for <b>${domain}</b>. Save one first.`);
                    }
                    return;
                  }

                  const e = candidates[idx++];
                  const blobId = e.fields?.blob_id ?? e.blob_id;

                  chrome.runtime.sendMessage({
                    type: 'DECRYPT_ENTRY',
                    walletAddress: address,
                    vaultRef: vault,
                    blobId,
                    signature: sigEv.data.signature,
                  }, (resp) => {
                    if (!resp?.success) {
                      // This entry failed to decrypt — skip, try next
                      decryptNext();
                      return;
                    }

                    const creds: { username: string; password: string } = resp.credentials;

                    if (typed) {
                      // Check if this decrypted entry's username matches what user typed
                      if (creds.username.toLowerCase().trim() !== typed) {
                        decryptNext(); // Not a match — try next entry
                        return;
                      }
                    }
                    // Found a match (or no filter — just use first successful decrypt)
                    closeModal({ signed: true, credentials: creds });
                  });
                }

                decryptNext();
              };
              window.addEventListener('message', sigListener);
            });
          });

      } else {
        // SAVE FLOW:
        // 1. Get wallet address from MAIN world
        // 2. GET_VAULT → get vaultId
        // 3. ENCRYPT_AND_UPLOAD (Seal + Walrus) → blobId
        // 4. BUILD_ADD_ENTRY_TX → unsigned TX bytes
        // 5. SIGN_AND_EXECUTE_TX in MAIN world
        const saveAddress = connectedAddress;
        if (!saveAddress) {
          setLoading(false);
          setErr('Wallet not connected. Please connect first.');
          return;
        }

        setStep('Looking up vault…');
        chrome.runtime.sendMessage({ type: 'GET_VAULT', address: saveAddress }, (vaultResp) => {
          if (!vaultResp?.success) {
            setLoading(false); setErr(vaultResp?.error ?? 'No vault found'); return;
          }
          const vault = vaultResp.vault;

          setStep('Encrypting with Seal + uploading to Walrus…');
          chrome.runtime.sendMessage({
            type: 'ENCRYPT_AND_UPLOAD',
            vaultId:  vault.objectId,
            domain:   saveData?.domain   ?? location.hostname,
            username: saveData?.username ?? '',
            password: saveData?.password ?? '',
          }, (encResp) => {
            if (!encResp?.success) {
              setLoading(false); setErr(`Encrypt failed: ${encResp?.error}`); return;
            }

            setStep('Building transaction…');
            chrome.runtime.sendMessage({
              type:     'BUILD_ADD_ENTRY_TX',
              address:  saveAddress,
              vaultId:  vault.objectId,
              siteName: saveData?.domain ?? location.hostname,
              username: saveData?.username ?? '',
              blobId:   encResp.blobId,
              category: 'other',
              notes:    `Saved by extvault from ${location.hostname}`,
            }, (txResp) => {
              if (!txResp?.success) {
                setLoading(false); setErr(`TX build failed: ${txResp?.error}`); return;
              }

              setStep('Sign with wallet to save…');
              window.postMessage({
                source:     'SV_ISOLATED',
                type:       'SIGN_AND_EXECUTE_TX',
                walletName: connectedWalletName,
                txBase64:   txResp.txBase64,
              }, '*');
              // Result handled in bridgeListener → SIGN_TX_RESULT
            });
          });
        });
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIND ASSOCIATED USERNAME FIELD
// Finds the text/email input that is closest BEFORE the password field in
// DOM order — which is how browsers and password managers identify the
// username/email field paired with a given password input.
// ─────────────────────────────────────────────────────────────────────────────
function findUsernameField(passwordInput: HTMLInputElement): HTMLInputElement | null {
  const form = passwordInput.closest('form');
  const scope: ParentNode = form ?? document;

  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input[type="tel"],'
      + 'input[autocomplete="username"], input[autocomplete="email"],'
      + 'input[name*="user"], input[name*="email"], input[name*="login"],'
      + 'input[id*="user"], input[id*="email"], input[id*="login"]'
    )
  ).filter(el => el !== passwordInput && !el.hidden && el.type !== 'hidden');

  // Split into fields that come BEFORE vs AFTER the password in DOM order
  const PRECEDING = Node.DOCUMENT_POSITION_PRECEDING;
  const before = candidates.filter(
    el => (passwordInput.compareDocumentPosition(el) & PRECEDING) !== 0
  );

  if (before.length > 0) {
    // Return the LAST one before password — it's the closest (e.g. email right above password)
    return before[before.length - 1];
  }

  // Fallback: any candidate in scope
  return candidates.length > 0 ? candidates[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 – AUTO-FILL DROPDOWN
// Appears when user focuses an input[type="password"]
// ─────────────────────────────────────────────────────────────────────────────
function injectAutofillUI(input: HTMLInputElement) {
  if (input.dataset.evInjected === 'true') return;
  input.dataset.evInjected = 'true';

  // Suppress Chrome's native autocomplete so our UI is visible
  input.setAttribute('autocomplete', 'new-password');
  input.setAttribute('readonly', 'readonly');
  input.addEventListener('focus', () => input.removeAttribute('readonly'));
  input.addEventListener('click', () => input.removeAttribute('readonly'));
  input.addEventListener('blur', () => { if (!input.value) input.setAttribute('readonly', 'readonly'); });

  // Also suppress on associated username/email inputs
  const form = input.closest('form');
  if (form) {
    form.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="email"]')
      .forEach(el => el.setAttribute('autocomplete', 'new-password'));
  }

  // ── Dropdown — appended to document.body with position:fixed
  // This guarantees it floats above everything (no z-index wars, no overflow:hidden clipping).
  const dd = document.createElement('div');
  dd.className = 'ev-dropdown';
  dd.style.cssText = `
    display:none;position:fixed;
    min-width:220px;background:#fff;border:3px solid #000;
    border-radius:12px;box-shadow:4px 4px 0 #000;
    z-index:2147483647;overflow:hidden;
  `;
  dd.innerHTML = `
    <div style="padding:6px 12px 5px;font-size:11px;color:#000;letter-spacing:.05em;
      text-transform:uppercase;border-bottom:2px solid #000;font-weight:900;background:#eefcdc;">
      extvault
    </div>
    <div id="ev-fill-btn-${Math.random().toString(36).slice(2)}" class="ev-fill-btn"
      style="padding:10px 12px;cursor:pointer;display:flex;align-items:center;
      gap:9px;color:#000;font-size:14px;font-weight:800;transition:background 0.12s;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      Unlock &amp; Auto-fill
    </div>
  `;
  document.body.appendChild(dd);

  // Position dropdown below the input using getBoundingClientRect (viewport-relative)
  function positionDropdown() {
    const r = input.getBoundingClientRect();
    dd.style.top  = (r.bottom + 5) + 'px';
    dd.style.left = r.left + 'px';
    // Flip above if not enough space below
    const ddHeight = dd.offsetHeight || 80;
    if (r.bottom + 5 + ddHeight > window.innerHeight && r.top - 5 - ddHeight > 0) {
      dd.style.top = (r.top - ddHeight - 5) + 'px';
    }
  }

  const fillBtn = dd.querySelector<HTMLElement>('.ev-fill-btn')!;
  fillBtn.onmouseenter = () => { fillBtn.style.background = '#8795fc'; };
  fillBtn.onmouseleave = () => { fillBtn.style.background = 'transparent'; };

  fillBtn.addEventListener('mousedown', async (e) => {
    e.preventDefault();
    dd.style.display = 'none';

    // Find the username field closest before this password input in DOM order
    const usernameField: HTMLInputElement | null = findUsernameField(input);

    // Read what the user has already typed in the username field (to filter vault entries)
    const typedUsername = usernameField?.value?.trim() ?? '';

    const result = await showModal('autofill', undefined, typedUsername || undefined);

    if (result.signed && result.credentials) {
      const { username, password } = result.credentials;

      // Native value setter — required to trigger React/Vue/Angular controlled inputs.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      function fillInput(el: HTMLInputElement, value: string) {
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
        if (nativeSetter) {
          nativeSetter.call(el, value);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('focus',  { bubbles: true }));
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true }));
      }

      // Fill username only when:
      // 1. Field is visually empty (Chrome autofill may set value visually but .value returns "")
      //    → use both .value and check for the :-webkit-autofill pseudo-class via a flag
      // 2. Field doesn't already contain exactly what we'd fill (avoid noisy re-events)
      if (usernameField && username) {
        const currentVal = usernameField.value.trim();
        const alreadyFilled = currentVal.toLowerCase() === username.toLowerCase();
        // Skip if already correct; skip if non-empty (user/browser put something else)
        if (!currentVal || alreadyFilled) {
          if (!alreadyFilled) {
            fillInput(usernameField, username);
          }
          // If alreadyFilled — correct value already present, no need to re-trigger events
        }
        // If currentVal !== "" AND !== username → user typed something else, don't overwrite
      }

      // Fill password
      fillInput(input, password);

      // Visual success flash
      input.style.transition = 'box-shadow 0.2s';
      input.style.boxShadow = '6px 6px 0px #8795fc';
      setTimeout(() => { input.style.boxShadow = ''; }, 1400);
    }
  });

  function showDD() {
    positionDropdown();
    dd.style.display = 'block';
  }
  function hideDD() { setTimeout(() => { dd.style.display = 'none'; }, 200); }

  input.addEventListener('focus', showDD);
  input.addEventListener('blur',  hideDD);

  // Reposition on scroll/resize so it tracks the input correctly
  window.addEventListener('scroll', () => { if (dd.style.display !== 'none') positionDropdown(); }, { passive: true, capture: true });
  window.addEventListener('resize', () => { if (dd.style.display !== 'none') positionDropdown(); }, { passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 – AUTO-SAVE BANNER
// Appears after form submit or password blur with a value
// ─────────────────────────────────────────────────────────────────────────────
function showSaveBanner(username: string, password: string) {
  if ($('ev-banner')) return;
  injectStyles();

  const domain = location.hostname;
  const banner = document.createElement('div');
  banner.id = 'ev-banner';
  banner.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:2147483646;
    width:320px;background:#fcf482;
    border:3px solid #000;border-radius:16px;
    box-shadow:6px 6px 0 #000;color:#000;
    padding:18px;animation:ev-in 0.25s cubic-bezier(.16,1,.3,1);
    font-family:'Inter',system-ui,-apple-system,sans-serif;
  `;
  banner.innerHTML = `
    <div style="margin-bottom:10px;">
      <strong style="font-size:16px;color:#000;font-weight:900;text-transform:uppercase;">Save to extvault?</strong>
    </div>
    <p style="font-size:13px;color:#000;margin:0 0 16px;line-height:1.6;font-weight:600;">
      Save encrypted password for <b style="color:#000;text-decoration:underline;">${domain}</b>?
    </p>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button id="ev-no" style="background:#fff;border:2px solid #000;
        color:#000;padding:8px 16px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;
        transition:all 0.15s;font-family:inherit;box-shadow:3px 3px 0 #000;text-transform:uppercase;">Dismiss</button>
      <button id="ev-yes" style="background:#93fca1;border:2px solid #000;
        color:#000;font-weight:800;padding:8px 20px;border-radius:10px;cursor:pointer;font-size:13px;
        box-shadow:3px 3px 0 #000;transition:all 0.15s;font-family:inherit;text-transform:uppercase;">Save</button>
    </div>
  `;
  document.body.appendChild(banner);

  const noBtn  = $('ev-no') as HTMLButtonElement;
  const yesBtn = $('ev-yes') as HTMLButtonElement;

  noBtn.onmouseenter  = () => { noBtn.style.transform = 'translate(-1px,-1px)'; noBtn.style.boxShadow = '4px 4px 0 #000'; };
  noBtn.onmouseleave  = () => { noBtn.style.transform = 'none'; noBtn.style.boxShadow = '3px 3px 0 #000'; };
  yesBtn.onmouseenter = () => { yesBtn.style.transform = 'translate(-2px,-2px)'; yesBtn.style.boxShadow = '5px 5px 0 #000'; yesBtn.style.background = '#a4fcae'; };
  yesBtn.onmouseleave = () => { yesBtn.style.transform = 'none'; yesBtn.style.boxShadow = '3px 3px 0 #000'; yesBtn.style.background = '#93fca1'; };

  noBtn.addEventListener('click', () => banner.remove());

  yesBtn.addEventListener('click', async () => {
    banner.innerHTML = `<div style="text-align:center;padding:8px;display:flex;align-items:center;justify-content:center;gap:8px;color:#000;font-size:14px;font-weight:700;font-family:inherit;text-transform:uppercase;">
      ${spinner('#000')} Opening signing panel…</div>`;
    const result = await showModal('save', { domain, username, password });
    if (result.signed) {
      banner.innerHTML = `<div style="text-align:center;color:#000;padding:10px;font-weight:900;font-size:15px;font-family:inherit;text-transform:uppercase;">✓ Saved to Vault!</div>`;
    } else {
      banner.innerHTML = `<div style="text-align:center;color:#000;font-size:14px;font-weight:700;padding:10px;font-family:inherit;text-transform:uppercase;">Cancelled.</div>`;
    }
    setTimeout(() => banner.remove(), 2200);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM INTERCEPTION
// ─────────────────────────────────────────────────────────────────────────────
function attachFormListeners() {
  document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => {
    if (input.dataset.evIntercepted === 'true') return;
    input.dataset.evIntercepted = 'true';

    const form = input.closest('form');
    const tryCapture = () => {
      const pass = input.value;
      if (!pass || pass.length < 4) return;
      const scope = form ?? document;
      const textFields = scope.querySelectorAll<HTMLInputElement>('input[type="text"],input[type="email"]');
      const user = textFields.length > 0 ? textFields[textFields.length - 1].value : '';
      setTimeout(() => showSaveBanner(user, pass), 600);
    };

    if (form) form.addEventListener('submit', tryCapture, { once: true });
    input.addEventListener('blur', tryCapture);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESS NATIVE PASSWORD MANAGERS (Chrome, Google, LastPass, etc.)
// Chrome ignores autocomplete="off" for password fields, but respects
// autocomplete="new-password" AND the combination of data attributes below.
// ─────────────────────────────────────────────────────────────────────────────
function suppressNativePasswordManager() {
  // Suppress on all forms
  document.querySelectorAll<HTMLFormElement>('form').forEach(form => {
    if (form.dataset.evSuppressed === 'true') return;
    form.dataset.evSuppressed = 'true';
    form.setAttribute('autocomplete', 'off');
    // data-lpignore disables LastPass; also helps Chrome de-prioritise
    form.setAttribute('data-lpignore', 'true');
  });

  // Suppress on all password fields
  document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(el => {
    if (el.dataset.evNsSuppressed === 'true') return;
    el.dataset.evNsSuppressed = 'true';
    // "new-password" is the only value Chrome still honours to block suggestions
    el.setAttribute('autocomplete', 'new-password');
    el.setAttribute('data-lpignore', 'true');
    el.setAttribute('data-form-type', 'other');
  });

  // Suppress on username / email fields adjacent to password fields
  document.querySelectorAll<HTMLInputElement>(
    'input[type="text"], input[type="email"]'
  ).forEach(el => {
    if (el.dataset.evNsSuppressed === 'true') return;
    el.dataset.evNsSuppressed = 'true';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('data-lpignore', 'true');
    el.setAttribute('data-form-type', 'other');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
function scanDOM() {
  suppressNativePasswordManager();
  document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(el => injectAutofillUI(el));
  attachFormListeners();
}

// Initial scan after DOM is ready, with MutationObserver for SPAs
setTimeout(scanDOM, 500);
new MutationObserver(scanDOM).observe(document.body, { childList: true, subtree: true });
