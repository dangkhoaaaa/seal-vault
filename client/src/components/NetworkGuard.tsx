'use client';
import { useCurrentWallet } from '@mysten/dapp-kit';
import { motion } from 'framer-motion';
import { AlertTriangle, Wifi, ArrowRight } from 'lucide-react';
import { APP_NETWORK, NETWORK_LABEL, type SuiNetwork } from '@/lib/config';

// Maps dapp-kit chain identifiers to our network keys.
// Chain IDs sourced from https://docs.sui.io/references/sui-api/sui-rpc-api
const CHAIN_TO_NETWORK: Record<string, SuiNetwork> = {
  'sui:testnet':  'testnet',
  'sui:mainnet':  'mainnet',
  'sui:devnet':   'devnet',
  'sui:localnet': 'localnet',
};

/**
 * Wraps page content and shows a friendly "wrong network" screen when the
 * connected wallet's chain does not match `APP_NETWORK`.
 *
 * Does not block unconnected users — only fires once a wallet is connected.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { currentWallet, connectionStatus } = useCurrentWallet();

  if (connectionStatus !== 'connected' || !currentWallet) {
    return <>{children}</>;
  }

  // Resolve the active chain the wallet reports.
  const activeChain = currentWallet.accounts[0]?.chains?.[0] as string | undefined;
  const activeNetwork = activeChain ? CHAIN_TO_NETWORK[activeChain] : undefined;

  // If we can't determine the chain, allow through (don't block on unknown wallets).
  if (!activeNetwork) return <>{children}</>;

  if (activeNetwork === APP_NETWORK) return <>{children}</>;

  // ── Wrong network detected ───────────────────────────────────────────────
  const targetLabel = NETWORK_LABEL[APP_NETWORK];
  const currentLabel = NETWORK_LABEL[activeNetwork] ?? activeChain ?? 'Unknown Network';

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="max-w-md w-full"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Wifi size={32} className="text-amber-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
              <AlertTriangle size={12} className="text-white" />
            </div>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-black text-center mb-2">Wrong Network</h2>
        <p className="text-center text-gray-400 text-sm mb-8">
          SealVault only runs on{' '}
          <span className="text-white font-semibold">{targetLabel}</span>.<br />
          Your wallet is currently connected to{' '}
          <span className="text-amber-400 font-semibold">{currentLabel}</span>.
        </p>

        {/* Steps */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4 mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">How to switch</p>
          {[
            'Open your Sui wallet extension',
            `Select "${targetLabel}" from the network list`,
            'Refresh this page',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-xs font-bold text-amber-400 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-gray-300">{step}</p>
            </div>
          ))}
        </div>

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-colors"
        >
          Refresh after switching <ArrowRight size={16} />
        </button>

        {/* Network badge */}
        <p className="text-center text-xs text-gray-600 mt-4">
          Target: <span className="text-gray-500">{targetLabel}</span>
        </p>
      </motion.div>
    </div>
  );
}
