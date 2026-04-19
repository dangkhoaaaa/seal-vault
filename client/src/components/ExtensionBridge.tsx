'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useEffect } from 'react';

export default function ExtensionBridge() {
  const account = useCurrentAccount();

  useEffect(() => {
    // Whenever wallet connection changes, broadcast to the Extension
    // The content script injected by SealVault extension on localhost:3000 will pick this up
    if (typeof window !== 'undefined') {
      window.postMessage({
        source: 'SEALVAULT_WEB',
        type: 'SYNC_SESSION',
        isConnected: !!account
      }, '*');
      console.log('SealVault Web: Synced session to Extension:', !!account);
    }
  }, [account]);

  return null; // Silent bridge component
}
