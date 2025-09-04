"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const token_wallet_1 = require("../lib/token-wallet");
const grammy_1 = require("grammy");
const database_1 = require("../lib/database");
const depositHandler = {
    command: "deposit",
    description: "Get your deposit address",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            const firstName = ctx.from?.first_name || "there";
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("✨ Set Up Wallet", "create_wallet")
                    .text("🔑 Import Wallet", "import_wallet");
                await ctx.reply(`👋 Hey ${firstName}! You need a wallet first.\n\nLet me set that up for you:`, { reply_markup: keyboard });
                return;
            }
            // Get the deposit address (now deterministic from database)
            const depositAddress = wallet.address;
            // Log for verification
            if (wallet.type === 'coinbase-smart-wallet') {
                console.log(`📍 Using Smart Wallet deposit address: ${depositAddress}`);
            }
            // Start 5-minute monitoring window for deposits
            (0, database_1.startDepositMonitoring)(userId, 5);
            // Force refresh event monitor to immediately watch this wallet
            try {
                const eventMonitor = require("../services/event-monitor.js");
                // For new Smart Wallets, set pre-deposit balance to 0 to ensure first-time flow
                if (wallet.type === 'coinbase-smart-wallet' && wallet.autoCreated) {
                    console.log(`🆕 New Smart Wallet detected, marking as first-time user for auto-deployment`);
                    await eventMonitor.setPreDepositBalance(userId, 0);
                }
                await eventMonitor.forceRefreshWallets();
                console.log(`🔄 Started 5-minute deposit monitoring for user ${userId}`);
            }
            catch (error) {
                console.error("Could not force refresh wallets:", error);
            }
            // Create action buttons
            const keyboard = new grammy_1.InlineKeyboard()
                .text("🦑 Start Earning", "zap_auto_deploy")
                .row()
                .text("💰 Check Balance", "check_balance")
                .text("📊 Portfolio", "view_portfolio");
            // Simplified deposit information
            await ctx.reply(`💰 *Ready to start earning, ${firstName}?*\n\n` +
                `Send USDC to your Smart Wallet:\n` +
                `\`${depositAddress}\`\n\n` +
                `*Network:* Base (super cheap fees!)\n` +
                `*Minimum:* Any amount\n` +
                `*Gas fees:* Sponsored by inkvest! 🦑\n\n` +
                `✅ **Now monitoring for deposits** (5 minutes)\n` +
                `I'll notify you when funds arrive! 🌱`, {
                parse_mode: "Markdown",
                reply_markup: keyboard,
            });
        }
        catch (error) {
            console.error("Error in deposit command:", error);
            await ctx.reply("❌ Something went wrong. Please try again in a moment.");
        }
    },
};
exports.default = depositHandler;
