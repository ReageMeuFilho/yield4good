import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, arbitrumSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Yield4Good',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id',
  chains: [sepolia, arbitrumSepolia],
  ssr: false,
});
