import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { TrendingUp, Wallet, Heart, ArrowDownToLine, ArrowUpFromLine, Sparkles } from 'lucide-react';
import VaultABI from '../contracts/Yield4GoodVault.json';
import ERC20ABI from '../contracts/MockERC20.json';
import RouterABI from '../contracts/DonationRouter.json';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS as `0x${string}`;
const ASSET_ADDRESS = import.meta.env.VITE_ASSET_ADDRESS as `0x${string}`;
const ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS as `0x${string}`;

interface DonationEvent {
  amount: string;
  beneficiary: string;
  timestamp: number;
  txHash: string;
}

export default function Dashboard() {
  const { address, isConnected, chain } = useAccount();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [donations, setDonations] = useState<DonationEvent[]>([]);

  const { data: totalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'totalAssets',
  });

  const { data: totalDonated } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'totalDonated',
  });

  const { data: userShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const { data: userAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'convertToAssets',
    args: userShares ? [userShares] : undefined,
  });

  const { data: allowance } = useReadContract({
    address: ASSET_ADDRESS,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: address && VAULT_ADDRESS ? [address, VAULT_ADDRESS] : undefined,
  });

  const { data: beneficiary } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'beneficiary',
  });

  const { data: owner } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VaultABI,
    functionName: 'owner',
  });

  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { writeContract: deposit, data: depositHash } = useWriteContract();
  const { writeContract: withdraw, data: withdrawHash } = useWriteContract();
  const { writeContract: harvest, data: harvestHash } = useWriteContract();

  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isDepositing } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: isWithdrawing } = useWaitForTransactionReceipt({ hash: withdrawHash });
  const { isLoading: isHarvesting } = useWaitForTransactionReceipt({ hash: harvestHash });

  useWatchContractEvent({
    address: ROUTER_ADDRESS,
    abi: RouterABI,
    eventName: 'YieldDonated',
    onLogs(logs) {
      const newDonations = logs.map((log: any) => ({
        amount: formatUnits(log.args.amount || 0n, 6),
        beneficiary: log.args.beneficiary,
        timestamp: Date.now(),
        txHash: log.transactionHash,
      }));
      setDonations((prev) => [...newDonations, ...prev].slice(0, 10));
    },
  });

  const handleApprove = () => {
    if (!depositAmount) return;
    approve({
      address: ASSET_ADDRESS,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, parseUnits(depositAmount, 6)],
    });
  };

  const handleDeposit = () => {
    if (!depositAmount || !address) return;
    deposit({
      address: VAULT_ADDRESS,
      abi: VaultABI,
      functionName: 'deposit',
      args: [parseUnits(depositAmount, 6), address],
    });
  };

  const handleWithdraw = () => {
    if (!withdrawAmount || !address) return;
    const shares = parseUnits(withdrawAmount, 18);
    withdraw({
      address: VAULT_ADDRESS,
      abi: VaultABI,
      functionName: 'redeem',
      args: [shares, address, address],
    });
  };

  const handleHarvest = () => {
    harvest({
      address: VAULT_ADDRESS,
      abi: VaultABI,
      functionName: 'harvest',
    });
  };

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase();
  const needsApproval = depositAmount && allowance !== undefined && parseUnits(depositAmount, 6) > (allowance as bigint);

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle className="text-2xl">Yield4Good</CardTitle>
            <CardDescription>
              Deposit USDC, keep your principal, donate 100% of yield to public goods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Yield4Good</h1>
          <p className="text-gray-600 mt-2">Donate yield, keep principal safe</p>
        </div>
        <ConnectButton />
      </div>

      {chain && (chain.id !== 11155111 && chain.id !== 421614) && (
        <Alert className="mb-6">
          <AlertDescription>
            Please switch to Sepolia or Arbitrum Sepolia testnet
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value Locked</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalAssets ? formatUnits(totalAssets as bigint, 6) : '0'} USDC
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Donated</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalDonated ? formatUnits(totalDonated as bigint, 6) : '0'} USDC
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userAssets ? formatUnits(userAssets as bigint, 6) : '0'} USDC
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {userShares ? formatUnits(userShares as bigint, 18) : '0'} shares
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Manage Position</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="deposit">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="deposit">Deposit</TabsTrigger>
                  <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                </TabsList>

                <TabsContent value="deposit" className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (USDC)</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    {needsApproval && (
                      <Button
                        onClick={handleApprove}
                        disabled={isApproving}
                        className="flex-1"
                      >
                        <ArrowDownToLine className="mr-2 h-4 w-4" />
                        {isApproving ? 'Approving...' : 'Approve'}
                      </Button>
                    )}
                    <Button
                      onClick={handleDeposit}
                      disabled={!depositAmount || needsApproval || isDepositing}
                      className="flex-1"
                    >
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      {isDepositing ? 'Depositing...' : 'Deposit'}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="withdraw" className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Shares to Redeem</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Available: {userShares ? formatUnits(userShares as bigint, 18) : '0'} shares
                    </p>
                  </div>
                  <Button
                    onClick={handleWithdraw}
                    disabled={!withdrawAmount || isWithdrawing}
                    className="w-full"
                  >
                    <ArrowUpFromLine className="mr-2 h-4 w-4" />
                    {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                  </Button>
                </TabsContent>
              </Tabs>

              <div className="mt-6 pt-6 border-t">
                <Button
                  onClick={handleHarvest}
                  disabled={isHarvesting}
                  variant="outline"
                  className="w-full"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isHarvesting ? 'Harvesting...' : 'Harvest Yield'}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Anyone can call harvest to donate accrued yield
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Donations</CardTitle>
              <CardDescription>Latest yield donations to public goods</CardDescription>
            </CardHeader>
            <CardContent>
              {donations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No donations yet
                </p>
              ) : (
                <div className="space-y-3">
                  {donations.map((donation, i) => (
                    <div key={i} className="flex justify-between items-start text-sm border-b pb-2">
                      <div>
                        <p className="font-medium">{donation.amount} USDC</p>
                        <a
                          href={`${chain?.blockExplorers?.default.url}/tx/${donation.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          View tx
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(donation.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {beneficiary && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Beneficiary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-mono break-all">{beneficiary as string}</p>
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card className="mt-6 border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="text-sm">Owner Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  You are the vault owner. Admin functions available via contract interaction.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
