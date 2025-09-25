# 🦑 inkvest Telegram Bot

**Your automated yield farming assistant that finds the best DeFi opportunities on Base.**

inkvest is a sophisticated Telegram bot designed to simplify the process of yield farming on the Base network. It provides a user-friendly interface to interact with various DeFi protocols, allowing users to deposit funds, earn yield, and manage their portfolio without needing deep technical expertise. The bot prioritizes security, user control, and maximizing returns within a user-defined risk tolerance.

## ✨ Core Features

- **🐙 Intelligent Auto-Deployment**: Scans supported protocols for the best yield opportunities and automatically deploys funds based on the user's risk settings.
- **🛡️ Safety First**: Interacts only with vetted, audited protocols with significant Total Value Locked (TVL).
- **📊 Real-time Portfolio Management**: Track your positions, view current values, and see your earnings update in real-time.
- **💸 Gasless Transactions**: Leverages Coinbase Smart Wallets and Paymasters to sponsor transaction fees, making DeFi accessible to everyone.
- **🔐 Non-Custodial**: Users maintain full control over their funds. The bot facilitates transactions, but users can export their private keys at any time.
- **🤖 Simple Telegram Interface**: All features are accessible through intuitive Telegram commands and buttons.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: Version 18 or higher.
- **npm**: Comes with Node.js.
- **Telegram Account**: To create and interact with the bot.
- **QuickNode Account**: For a reliable Base network RPC endpoint.

### 1. Clone and Install Dependencies

First, clone the repository to your local machine and install the required npm packages.

```bash
git clone <repository-url>
cd telegram-bot
npm install
```

### 2. Environment Setup

The bot uses a `.env` file for configuration. Copy the example file to create your own:

```bash
cp .env.example .env
```

Next, you need to generate a secure encryption key to protect user wallet data.

```bash
# This command generates a 32-byte random key encoded in base64.
openssl rand -base64 32
```

### 3. Configure Environment Variables

Open the `.env` file and fill in the required values:

```env
# 1. Get this from @BotFather on Telegram after creating a new bot.
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# 2. Get this from QuickNode (Base Mainnet endpoint).
QUICKNODE_RPC=https://your-quicknode-endpoint.quiknode.pro/your-api-key/

# 3. Paste the key you generated in the previous step.
WALLET_ENCRYPTION_KEY=your_32_character_encryption_key
```

### 4. Run the Bot

You can run the bot in either development or production mode.

```bash
# Development mode (with auto-reloading on file changes)
npm run dev

# Production mode
npm run build
npm start
```

Your bot should now be running and ready to accept commands on Telegram!

## 🤖 Bot Usage Guide

Interact with your bot on Telegram using the following commands.

### Core Commands

- **/start**: Initializes the bot, creates a new secure smart wallet, and displays the main menu.
- **/wallet**: Shows your wallet address and provides options to export your private key.
- **/balance**: Displays your current ETH and USDC balances.
- **/portfolio**: Shows a detailed view of your active DeFi investments, including current value and APY.
- **/earn**: The main command to start investing. It offers both automatic and manual deployment options.
- **/harvest**: Collects any claimable reward tokens from your DeFi positions.
- **/withdraw**: Allows you to exit your positions and withdraw funds back to your wallet.
- **/settings**: Lets you configure your risk tolerance, slippage, and minimum APY preferences.
- **/help**: Provides a simple guide on how the bot works.

## 🏗️ Codebase Structure

The `telegram-bot` directory is organized as follows:

- **`src/`**: Contains all the core source code for the bot.
  - **`commands/`**: Each file defines a primary bot command (e.g., `/start`, `/wallet`).
  - **`lib/`**: Core logic for interacting with the blockchain, database, and external APIs.
    - `coinbase-wallet.ts`: Manages Coinbase Smart Wallet creation and gasless transactions.
    - `database.ts`: Handles all interactions with the SQLite database.
    - `defi-protocols.ts`: Contains logic for interacting with specific DeFi protocols (Aave, Compound, etc.).
    - `defillama-api.ts`: Fetches APY and pool data from DeFiLlama.
    - `encryption.ts`: Handles the encryption and decryption of user private keys.
    - `token-wallet.ts`: Provides utility functions for wallet and token management.
  - **`services/`**: Background services and high-level business logic.
    - `apy-orchestrator.ts`: Manages fetching and caching APY data from multiple sources.
    - `event-monitor.js`: A WebSocket-based service to monitor for user deposits in real-time.
  - **`types/`**: Contains all TypeScript type definitions and interfaces.
  - **`utils/`**: Utility functions for formatting, validation, and other helpers.
- **`index.ts`**: The main entry point of the application. It initializes the bot, sets up middleware, and registers all command handlers.
- **`README.md`**: This file.

## 🔒 Security

Security is a top priority for the inkvest bot.

- **Non-Custodial**: Users always have full control over their funds. Private keys can be exported at any time.
- **Encryption**: All private keys are encrypted at rest using AES-256 with a secret key you provide.
- **Gasless Safety**: By sponsoring transactions, the bot abstracts away the need for users to hold ETH for gas, reducing a common point of friction and error.
- **Vetted Protocols**: The bot only integrates with well-established and audited DeFi protocols.

## 🤝 Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

1. Fork the repository.
2. Create your feature branch: `git checkout -b feature/my-new-feature`.
3. Commit your changes: `git commit -m 'Add some feature'`.
4. Push to the branch: `git push origin feature/my-new-feature`.
5. Open a Pull Request.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is for educational purposes only. DeFi is inherently risky. **Use this software at your own risk.** Always do your own research and never invest more than you can afford to lose. The creators of this bot are not liable for any financial losses.