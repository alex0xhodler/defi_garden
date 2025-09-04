"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMainMenuKeyboard = createMainMenuKeyboard;
exports.getMainMenuMessage = getMainMenuMessage;
const grammy_1 = require("grammy");
/**
 * Create standardized main menu keyboard
 * This should be used across all commands to maintain consistency
 */
function createMainMenuKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text("💰 Check Balance", "check_balance")
        .text("🦑 Start Earning", "zap_funds")
        .row()
        .text("📊 Portfolio", "view_portfolio")
        .text("🌾 Harvest", "harvest_yields")
        .row()
        .text("⚙️ Settings", "open_settings")
        .text("📋 Help", "help");
}
/**
 * Main menu message text with portfolio check and user state detection
 */
async function getMainMenuMessage(firstName = "there", walletAddress, userId) {
    const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
    const highestAPY = await getHighestAPY();
    // Check user's fund status if userId and wallet provided
    if (userId && walletAddress) {
        try {
            const { getCoinbaseWalletUSDCBalance, getCoinbaseSmartWallet } = await Promise.resolve().then(() => __importStar(require('../lib/coinbase-wallet')));
            const { getAaveBalance, getFluidBalance, getCompoundBalance } = await Promise.resolve().then(() => __importStar(require('../lib/token-wallet')));
            const { calculateRealTimeEarnings } = await Promise.resolve().then(() => __importStar(require('./earnings')));
            // Get Smart Wallet address for Compound deposits (since deposits are made via CDP)
            const smartWallet = await getCoinbaseSmartWallet(userId);
            const smartWalletAddress = smartWallet?.smartAccount.address;
            // Fetch wallet USDC and DeFi positions
            const [walletUsdc, aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
                getCoinbaseWalletUSDCBalance(walletAddress).catch(() => '0.00'),
                getAaveBalance(walletAddress).catch(() => ({ aUsdcBalanceFormatted: '0.00' })),
                getFluidBalance(walletAddress).catch(() => ({ fUsdcBalanceFormatted: '0.00' })),
                // Check Compound balance on Smart Wallet address since deposits are made there
                smartWalletAddress ? getCompoundBalance(smartWalletAddress).catch(() => ({ cUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ cUsdcBalanceFormatted: '0.00' })
            ]);
            const walletUsdcNum = parseFloat(walletUsdc);
            const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
            const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
            const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
            const totalDeployed = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum;
            // STATE 1: User has active DeFi positions
            if (totalDeployed > 0.01) {
                const { getCompoundV3APY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
                const apy = await getCompoundV3APY();
                const earnings = calculateRealTimeEarnings(totalDeployed, apy);
                let message = `🐙 *Welcome back ${firstName}!*\n\n`;
                message += `💰 **Portfolio Summary:**\n`;
                if (compoundBalanceNum > 0.01) {
                    message += `• $${compoundBalanceNum.toFixed(2)} in Compound V3 (${apy}% APY)\n`;
                }
                if (aaveBalanceNum > 0.01) {
                    message += `• $${aaveBalanceNum.toFixed(2)} in Aave V3\n`;
                }
                if (fluidBalanceNum > 0.01) {
                    message += `• $${fluidBalanceNum.toFixed(2)} in Fluid Protocol\n`;
                }
                message += `\n💸 **Total Value:** $${totalDeployed.toFixed(2)}\n`;
                message += `🦑 **Earning:** ${earnings} automatically\n\n`;
                message += `✅ Auto-compounding activated\n`;
                message += `✅ Withdraw anytime, zero lock-ups\n`;
                message += `✅ Gas-sponsored transactions\n\n`;
                message += `What would you like to do?`;
                return message;
            }
            // STATE 2: User has wallet USDC but not deployed
            if (walletUsdcNum > 0.01) {
                const { fetchRealTimeYields, getHighestAPY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
                // Get the best protocol and APY dynamically
                let bestProtocol = "Compound V3";
                let apy = 7.65; // fallback
                try {
                    const opportunities = await fetchRealTimeYields();
                    if (opportunities.length > 0) {
                        const best = opportunities.sort((a, b) => b.apy - a.apy)[0];
                        bestProtocol = best.project;
                        apy = best.apy;
                    }
                }
                catch (error) {
                    console.warn("Failed to fetch real-time yields for main menu, using fallback");
                    // Try to get cached high APY
                    try {
                        apy = await getHighestAPY();
                    }
                    catch {
                        // Use fallback
                    }
                }
                let message = `🐙 *Welcome back ${firstName}!*\n\n`;
                message += `💰 **Ready to deploy:** $${walletUsdcNum.toFixed(2)} USDC\n\n`;
                message += `🦑 **Start earning ${apy}% APY** with the best available protocol!\n\n`;
                message += `✅ Gasless transactions (we sponsor gas)\n`;
                message += `✅ Auto-compounding activated\n`;
                message += `✅ Withdraw anytime, zero lock-ups\n\n`;
                message += `Ready to start earning?`;
                return message;
            }
        }
        catch (error) {
            console.error('Error fetching user funds for main menu:', error);
            // If API is rate limited, show a user-friendly message instead of falling through
            if (error?.status === 429 || error?.message?.includes('limit exceeded')) {
                // Get dynamic APY for rate-limited fallback
                let fallbackAPY = highestAPY;
                try {
                    const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require('../lib/defillama-api')));
                    fallbackAPY = await getHighestAPY();
                }
                catch {
                    // Use parameter fallback
                }
                return `🐙 *Welcome back ${firstName}!*\n\n` +
                    `⚠️ **Experiencing high load** - Balance checking temporarily limited\n\n` +
                    `🦑 **Start earning ${fallbackAPY}% APY** with the best available protocol!\n\n` +
                    `✅ Gasless transactions (we sponsor gas)\n` +
                    `✅ Auto-compounding activated\n` +
                    `✅ Withdraw anytime, zero lock-ups\n\n` +
                    `Ready to start earning?`;
            }
            // Fall through to generic message for other errors
        }
    }
    // STATE 3: Generic message for users who somehow reach main menu without funds
    // Note: This shouldn't happen with proper flow control
    let message = `🦑 *Welcome back ${firstName}! Earn ${highestAPY}% APY starting today.*\n\n`;
    if (walletAddress) {
        message += `💰 *Your inkvest address:*\n\`${walletAddress}\`\n\n` +
            `Send USDC on Base ↑ and watch your money grow.\n\n` +
            `✅ AI finds highest yields automatically\n` +
            `✅ Compounds 24/7 while you sleep\n` +
            `✅ Withdraw anytime, zero lock-ups\n\n`;
    }
    else {
        message += `✅ AI finds highest yields automatically\n` +
            `✅ Compounds 24/7 while you sleep\n` +
            `✅ Withdraw anytime, zero lock-ups\n\n`;
    }
    message += `Ready to take action?`;
    return message;
}
