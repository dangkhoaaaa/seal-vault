'use client';

import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/Toast';
import { NetworkGuard } from '@/components/NetworkGuard';
import { APP_NETWORK, SUI_RPC_URL } from '@/lib/config';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
  testnet:  { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet'  as const },
  mainnet:  { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet'  as const },
  devnet:   { url: 'https://fullnode.devnet.sui.io:443',  network: 'devnet'   as const },
  localnet: { url: 'http://127.0.0.1:9000',              network: 'localnet' as const },
} as any);

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={APP_NETWORK as any}>
        <WalletProvider autoConnect>
          <ToastProvider>
            <NetworkGuard>
              {children}
            </NetworkGuard>
          </ToastProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
