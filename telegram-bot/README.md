# 🌱 DeFi Garden Telegram Bot

**Your automated yield farming assistant that finds the best DeFi opportunities**

Auto-deploy funds to the highest-yielding, safest DeFi protocols with just a few taps in Telegram.

## ✨ Features

### 🐙 **Intelligent Auto-Deployment**
- Scans 50+ protocols for best opportunities
- Filters by risk level, TVL, and audit status  
- Auto-selects highest APY pools within your risk tolerance
- Gas cost protection (won't let you overpay)

### 🛡️ **Safety First**
- Only vetted protocols with $10M+ TVL for auto-deployment
- 24/7 monitoring with emergency alerts
- Smart contract audit requirements
- User maintains full control of funds

### 📊 **Portfolio Management** 
- Real-time position tracking and yield calculations
- One-click harvest and compound functionality
- Performance analytics and P&L tracking
- Auto-compounding with customizable strategies

### ⚡ **User Experience**
- Simple Telegram interface - no complex DeFi knowledge needed
- Works on any device with Telegram
- Secure wallet creation and import
- Multi-chain support (starting with Base for cheap gas)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Telegram account
- QuickNode account (for RPC access)

### 1. Clone and Install

```bash
git clone <repository-url>
cd telegram-bot
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Generate encryption key
openssl rand -base64 32
```

### 3. Configure Environment Variables

Edit `.env` with your values:

```env
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# Get from QuickNode (Base network endpoint)
QUICKNODE_RPC=https://your-endpoint.quiknode.pro/key

# Use the generated encryption key
WALLET_ENCRYPTION_KEY=your_32_char_key
```

### 4. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` command
3. Choose a name and username for your bot
4. Copy the provided token to your `.env` file

### 5. Get QuickNode RPC Endpoint

1. Sign up at [QuickNode](https://www.quicknode.com)
2. Create a Base Mainnet endpoint
3. Copy the HTTP URL to your `.env` file

### 6. Run the Bot

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

### 7. Test Your Bot

1. Search for your bot on Telegram
2. Send `/start` command
3. Follow the setup flow to create a wallet
4. Deposit some USDC and try `/zap`!

## 🎯 Usage Guide

### Basic Commands

- **`/start`** - Initialize bot and create/import wallet
- **`/balance`** - Check your token balances  
- **`/zap`** - Auto-deploy funds to best yield opportunities
- **`/portfolio`** - View your DeFi positions and yields
- **`/harvest`** - Claim yields and compound rewards
- **`/settings`** - Adjust risk tolerance and preferences

### Wallet Management

- **`/wallet`** - View wallet address and info
- **`/deposit`** - Show your deposit address  
- **`/withdraw`** - Withdraw funds to another address
- **`/import`** - Import existing wallet via private key
- **`/export`** - Export your private key (with confirmation)

### Getting Started Flow

1. **Create Wallet**: Use `/start` to create a new wallet or import existing
2. **Deposit Funds**: Send USDC to your wallet address (use `/deposit` to get it)
3. **Set Risk Level**: Use `/settings` to choose your risk tolerance (1-5)
4. **Start Farming**: Use `/zap` to auto-deploy to best opportunities
5. **Track Progress**: Use `/portfolio` to monitor your yields
6. **Harvest Rewards**: Use `/harvest` to claim and compound yields

## 🔧 Configuration

### Risk Levels

- **Level 1** 🛡️ - Very Safe: Only Aave, Compound (3-5% APY)
- **Level 2** 🟢 - Conservative: + Yearn, established DeFi (4-8% APY)  
- **Level 3** 🟡 - Moderate: + Some newer protocols (5-15% APY)
- **Level 4** 🟠 - Aggressive: Higher yield farming (10-25% APY)
- **Level 5** 🔴 - Maximum Yield: All protocols (15%+ APY)

### Auto-Deployment Safety Rules

- **TVL Minimum**: $100M+ for auto-deployment, $10M absolute minimum
- **Audit Requirement**: Only audited protocols from reputable firms
- **Gas Protection**: Transactions blocked if gas >10% of investment
- **Slippage Limits**: Configurable 0.1-5% maximum price impact

## 🏗️ Architecture

### Core Components

```
📱 Telegram Bot (Grammy)
├── 💾 SQLite Database (positions, transactions, settings)
├── 🔐 Wallet Management (encrypted private keys)
├── 🌐 DeFi Integration (1inch + protocol-specific contracts)
├── 📊 Yield Optimization (DeFiLlama API + risk scoring)
└── ⚡ Real-time Monitoring (position updates, emergency alerts)
```

### Database Schema

- **Users**: Telegram user info and registration
- **Wallets**: Encrypted private keys and addresses
- **Settings**: Risk levels, slippage, auto-compound preferences
- **Positions**: Active DeFi positions with yields and performance
- **Transactions**: Complete history of zaps, harvests, and transfers

### Security Features

- **AES-256 Encryption**: All private keys encrypted at rest
- **No Private Key Exposure**: Keys never logged or transmitted
- **Session Management**: Secure session handling with timeout
- **Input Validation**: All user inputs sanitized and validated
- **Database Transactions**: Atomic operations prevent data corruption

## 🔒 Security Considerations

### Private Key Management
- Keys are encrypted with AES-256-CBC before storage
- Encryption key must be kept secure and never shared
- Keys are decrypted only in memory during operations
- Database access requires proper authentication

### Gas Protection
- Transactions are blocked if gas cost >10% of investment
- Users are warned about high gas periods
- Alternative chains suggested for small amounts

### Smart Contract Risks
- Only interact with audited protocols  
- TVL thresholds enforced for safety
- Emergency monitoring for protocol issues
- Users can exit positions at any time

## 🚀 Deployment

### Production Setup

1. **Server Requirements**: 
   - VPS with 1GB+ RAM
   - Node.js 18+
   - SSL certificate for webhooks (optional)

2. **Environment Variables**:
   ```bash
   NODE_ENV=production
   DB_PATH=/path/to/secure/database.sqlite
   WALLET_ENCRYPTION_KEY=secure_32_char_key
   ```

3. **Process Management**:
   ```bash
   # Install PM2 for production process management
   npm install -g pm2
   
   # Start bot with PM2
   pm2 start index.ts --name defi-garden-bot
   
   # Enable auto-restart on server reboot
   pm2 startup
   pm2 save
   ```

4. **Database Backup**:
   ```bash
   # Daily backup of SQLite database
   cp defi-garden.sqlite defi-garden-backup-$(date +%Y%m%d).sqlite
   ```

### Monitoring

- Monitor bot uptime and response times
- Set up alerts for database errors
- Track gas price spikes and user impact
- Monitor protocol TVL changes and alerts

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`  
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add comprehensive error handling
- Test all user flows manually
- Never commit actual private keys or tokens
- Update documentation for new features

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided for educational and informational purposes only. DeFi investments carry inherent risks including:

- Smart contract vulnerabilities
- Impermanent loss in liquidity pools  
- Market volatility and potential losses
- Protocol governance risks
- Regulatory changes

**Use at your own risk. Never invest more than you can afford to lose. Always do your own research before making investment decisions.**

## 🆘 Support

- **Issues**: Report bugs or request features via GitHub Issues
- **Discussions**: Join community discussions in GitHub Discussions
- **Security**: Report security issues privately to [security@defigarden.com]

---

**Built with ❤️ for the DeFi community**

*Making yield farming accessible to everyone, one Telegram message at a time.*