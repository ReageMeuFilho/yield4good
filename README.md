# Yield4Good

> **Deposit stays safe. Yield funds public goods.**

Yield4Good is a yield-donating strategy (YDS) built on Octant v2 that allows users to deposit stablecoins (USDC), keep their principal fully withdrawable, and automatically route 100% of generated yield to public goods beneficiaries with transparent, on-chain proofs.

## 🎯 Hackathon Alignment

**Primary Prize**: Best use of a Yield Donating Strategy ($4,000)  
**Secondary Prize**: Best tutorial for Octant v2 ($1,500)

## ✨ Features

- **Principal Safety**: Your deposits remain 100% withdrawable at any time
- **100% Yield Donation**: All generated yield goes directly to public goods
- **ERC-4626 Vault**: Standard-compliant tokenized vault with share-based accounting
- **Transparent On-Chain**: All donations emit events and are fully verifiable
- **Flexible Strategy**: Pluggable yield strategy (MockStrategy for demos, Aave v3 ready)
- **Admin Controls**: Pause, emergency withdraw, beneficiary management
- **Modern Frontend**: React + Wagmi + RainbowKit with real-time donation feed

## 🏗️ Architecture

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ deposit USDC
       ▼
┌─────────────────────┐
│  Yield4GoodVault    │ (ERC-4626)
│  - Manages shares   │
│  - Routes to strat  │
└──────┬──────────────┘
       │ invest
       ▼
┌─────────────────────┐
│   MockStrategy      │
│  - Holds principal  │
│  - Accrues yield    │
└──────┬──────────────┘
       │ harvest()
       ▼
┌─────────────────────┐
│  DonationRouter     │
│  - Forwards yield   │
│  - Emits events     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│   Beneficiary       │ (Public Goods Wallet)
└─────────────────────┘
```

## 📦 Repository Structure

```
yield4good/
├── contracts/
│   ├── interfaces/
│   │   ├── IYieldStrategy.sol
│   │   └── IDonationRouter.sol
│   ├── vaults/
│   │   └── Yield4GoodVault.sol      # Main ERC-4626 vault
│   ├── strategies/
│   │   └── MockStrategy.sol         # Programmable yield for demos
│   ├── routers/
│   │   └── DonationRouter.sol       # Donation forwarding
│   └── mocks/
│       └── MockERC20.sol            # Test token
├── test/
│   ├── MockStrategy.test.ts
│   ├── DonationRouter.test.ts
│   └── Yield4GoodVault.test.ts      # Comprehensive tests
├── scripts/
│   ├── deploy.ts                    # Deployment script
│   └── simulate-harvest.ts          # Demo harvest flow
├── app/                             # React frontend
│   └── src/
│       ├── components/
│       │   └── Dashboard.tsx        # Main UI
│       └── contracts/               # ABIs
├── docs/
│   ├── ARCHITECTURE.md
│   └── TUTORIAL.md
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- MetaMask or compatible wallet
- Testnet ETH (Sepolia or Arbitrum Sepolia)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd yield4good

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your keys and addresses
```

### Running Tests

```bash
# Compile contracts
npm run compile

# Run all tests
npm test

# Run with coverage
npm run coverage
```

**Test Results**: 45 passing tests covering:
- MockStrategy: invest, divest, harvest, yield simulation
- DonationRouter: donation forwarding, event emission
- Yield4GoodVault: deposit, withdraw, harvest, multi-user scenarios, admin controls

### Deployment

```bash
# Deploy to Sepolia
npm run deploy

# Deploy to Arbitrum Sepolia
npm run deploy:arbsepolia

# Verify contracts
npm run verify -- --network sepolia <CONTRACT_ADDRESS>
```

After deployment, update your `.env` with the deployed addresses.

### Simulate Harvest

```bash
# Set simulated yield and call harvest
SIMULATED_YIELD=1000000 npm run harvest
```

### Frontend

```bash
cd app

# Copy environment file
cp .env.example .env
# Add deployed contract addresses

# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit `http://localhost:5173` to interact with the vault.

## 📝 Contract Addresses

### Sepolia Testnet

| Contract | Address |
|----------|---------|
| Yield4GoodVault | `TBD` |
| MockStrategy | `TBD` |
| DonationRouter | `TBD` |
| USDC (Test) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

### Arbitrum Sepolia

| Contract | Address |
|----------|---------|
| Yield4GoodVault | `TBD` |
| MockStrategy | `TBD` |
| DonationRouter | `TBD` |
| USDC (Test) | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

## 🔧 How It Works

### 1. Deposit

Users approve USDC and call `vault.deposit(amount, receiver)`. The vault:
- Mints shares proportional to deposit
- Transfers USDC to the strategy
- Strategy invests the capital

### 2. Yield Accrual

The strategy accrues yield over time:
- **MockStrategy**: Programmable via `setSimulatedYield(amount)`
- **AaveStrategy** (optional): Earns interest from Aave v3

### 3. Harvest

Anyone can call `vault.harvest()`:
- Strategy realizes yield and returns it to vault
- Vault approves DonationRouter
- Router forwards yield to beneficiary
- Events emitted for transparency
- `totalDonated` increments

### 4. Withdraw

Users call `vault.redeem(shares, receiver, owner)`:
- Vault burns shares
- If needed, divests from strategy
- Returns principal (yield already donated)

## 🎨 Frontend Features

- **Connect Wallet**: RainbowKit integration
- **Dashboard Metrics**:
  - Total Value Locked (TVL)
  - Total Donated
  - User Balance
- **Deposit/Withdraw**: Intuitive tabs with approval flow
- **Harvest**: One-click yield donation
- **Donation Feed**: Real-time event stream with tx links
- **Network Detection**: Prompts for correct testnet
- **Owner Controls**: Admin panel for vault owner

## 🔐 Security Considerations

- **Reentrancy Protection**: All state-changing functions use `nonReentrant`
- **Pausable**: Owner can pause deposits/harvest (withdrawals always allowed)
- **Emergency Divest**: Owner can pull funds from strategy
- **Input Validation**: Zero-address and zero-amount checks
- **Safe ERC20**: Uses OpenZeppelin's SafeERC20
- **Allowance Management**: Resets approvals after use

## 🧪 Testing Strategy

### Unit Tests
- Each contract tested in isolation
- Edge cases: zero amounts, unauthorized access, insufficient funds

### Integration Tests
- Multi-user deposits and withdrawals
- Harvest flow end-to-end
- Principal safety verification
- Paused state behavior

### Invariants
- User assets ≤ vault totalAssets
- Donations never reduce principal
- Share/asset conversions consistent

## 📚 Documentation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Detailed system design
- **[TUTORIAL.md](docs/TUTORIAL.md)**: Step-by-step Octant v2 guide

## 🛣️ Roadmap

### MVP (Current)
- ✅ ERC-4626 vault
- ✅ MockStrategy for demos
- ✅ DonationRouter
- ✅ Comprehensive tests
- ✅ Frontend with Wagmi
- ✅ Documentation

### Future Enhancements
- [ ] Aave v3 strategy integration
- [ ] Multi-asset support (DAI, USDT)
- [ ] Beneficiary voting/selection
- [ ] DonorProofNFT (soulbound)
- [ ] Subgraph for historical data
- [ ] Multi-chain deployment

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT

## 🙏 Acknowledgments

- **Octant v2** for the YDS framework
- **OpenZeppelin** for battle-tested contracts
- **Wagmi** and **RainbowKit** for web3 UX
- **Hardhat** for development tooling

## 📞 Contact

- GitHub: [Your GitHub]
- Twitter: [Your Twitter]
- Discord: [Your Discord]

---

**Built for Octant v2 Hackathon** | [Demo Video](#) | [Live App](#)
