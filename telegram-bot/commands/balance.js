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
exports.balanceHandler = void 0;
exports.handleWithdrawEth = handleWithdrawEth;
exports.handleWithdrawUsdc = handleWithdrawUsdc;
exports.handleWithdrawTextInput = handleWithdrawTextInput;
const token_wallet_1 = require("../lib/token-wallet");
const coinbase_wallet_1 = require("../lib/coinbase-wallet");
const grammy_1 = require("grammy");
const viem_1 = require("viem");
const constants_1 = require("../utils/constants");
// Handler for balance command
exports.balanceHandler = {
    command: "balance",
    description: "Show current ETH + filtered ERC-20 balances",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                await ctx.reply("❌ You don't have a wallet yet.\n\n" +
                    "Use /create to create a new wallet or /import to import an existing one.");
                return;
            }
            // Check RPC configuration first
            if (!(0, constants_1.isRpcConfigured)()) {
                await ctx.reply("❌ **RPC Configuration Error**\n\n" +
                    "Your RPC endpoint is not properly configured. Please:\n\n" +
                    "1. Get a proper RPC endpoint from QuickNode or similar\n" +
                    "2. Update your `.env` file:\n" +
                    "   `QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`\n" +
                    "3. Restart the bot\n\n" +
                    "**Current RPC**: Using rate-limited public endpoint\n" +
                    "**Solution**: Get a dedicated RPC with higher limits", { parse_mode: "Markdown" });
                return;
            }
            await ctx.reply("⏳ Fetching your balances...");
            try {
                // Get wallet balances
                const ethBalance = await (0, token_wallet_1.getEthBalance)(wallet.address);
                const tokenBalances = await (0, token_wallet_1.getMultipleTokenBalances)([constants_1.BASE_TOKENS.USDC], wallet.address);
                // Get DeFi positions
                const { getAaveBalance, getFluidBalance, getCompoundBalance } = await Promise.resolve().then(() => __importStar(require("../lib/token-wallet")));
                const [aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
                    getAaveBalance(wallet.address),
                    getFluidBalance(wallet.address),
                    getCompoundBalance(wallet.address)
                ]);
                // Build smart balance message showing only positive balances
                let message = `💰 **Your inkvest Balance**\n\n`;
                let hasAnyBalance = false;
                // ETH Balance (show if > 0.001)
                const ethNum = parseFloat((0, viem_1.formatEther)(BigInt(ethBalance)));
                if (ethNum > 0.001) {
                    message += `⚡ **ETH**: ${ethNum.toFixed(4)} ETH\n`;
                    hasAnyBalance = true;
                }
                // USDC Balance (show if > 0.01)
                const usdcBalance = tokenBalances.find(token => token.symbol === "USDC");
                if (usdcBalance) {
                    const usdcNum = parseFloat((0, token_wallet_1.formatTokenAmount)(usdcBalance.balance, 6, 2));
                    if (usdcNum > 0.01) {
                        message += `💵 **USDC**: $${usdcNum.toFixed(2)}\n`;
                        hasAnyBalance = true;
                    }
                }
                // DeFi Positions (show if > 0.01)
                let totalDefiValue = 0;
                let defiPositions = "";
                const aaveNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
                if (aaveNum > 0.01) {
                    defiPositions += `🏛️ **Aave V3**: $${aaveNum.toFixed(2)} USDC\n`;
                    totalDefiValue += aaveNum;
                    hasAnyBalance = true;
                }
                const fluidNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
                if (fluidNum > 0.01) {
                    defiPositions += `🌊 **Fluid**: $${fluidNum.toFixed(2)} USDC\n`;
                    totalDefiValue += fluidNum;
                    hasAnyBalance = true;
                }
                const compoundNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
                if (compoundNum > 0.01) {
                    defiPositions += `🏦 **Compound V3**: $${compoundNum.toFixed(2)} USDC\n`;
                    totalDefiValue += compoundNum;
                    hasAnyBalance = true;
                }
                if (defiPositions) {
                    message += `\n🦑 **Earning Positions**:\n${defiPositions}`;
                }
                // Show total if user has DeFi positions
                if (totalDefiValue > 0) {
                    const usdcNum = usdcBalance ? parseFloat((0, token_wallet_1.formatTokenAmount)(usdcBalance.balance, 6, 2)) : 0;
                    const totalValue = usdcNum + totalDefiValue;
                    message += `\n💎 **Total Value**: $${totalValue.toFixed(2)}`;
                }
                if (!hasAnyBalance) {
                    message += `📭 **No significant balances found**\n\n`;
                    message += `💡 *Tip: Deposit USDC to start earning!*`;
                }
                // Enhanced keyboard with better navigation
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("📥 Deposit USDC", "deposit")
                    .text("📤 Withdraw USDC", "withdraw_usdc")
                    .row()
                    .text("📊 Portfolio", "view_portfolio")
                    .text("🐙 Earn More", "zap_funds")
                    .row()
                    .text("🔄 Refresh", "check_balance");
                await ctx.reply(message, {
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                });
            }
            catch (rpcError) {
                console.error("RPC Error in balance command:", rpcError);
                if (rpcError.message === "RPC_NOT_CONFIGURED") {
                    await ctx.reply("❌ **RPC Configuration Error**\n\n" +
                        "Please update your `.env` file with a proper RPC endpoint:\n" +
                        "`QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`", { parse_mode: "Markdown" });
                }
                else if (rpcError?.cause?.status === 429 || rpcError?.details?.includes('rate limit')) {
                    await ctx.reply("⏳ **Rate Limit Hit**\n\n" +
                        "Your RPC endpoint is being rate limited. Please:\n\n" +
                        "• Wait a few minutes and try again\n" +
                        "• Consider upgrading to a higher-tier RPC plan\n" +
                        "• Or use a different RPC provider\n\n" +
                        "Current endpoint appears to have low rate limits.");
                }
                else {
                    await ctx.reply("❌ **Network Error**\n\n" +
                        "Failed to fetch balances. This might be due to:\n\n" +
                        "• RPC endpoint issues\n" +
                        "• Network connectivity problems\n" +
                        "• Temporary service outage\n\n" +
                        "Please try again in a few minutes.");
                }
            }
        }
        catch (error) {
            console.error("Error in balance command:", error);
            await ctx.reply("❌ An unexpected error occurred while fetching your balances. Please try again later.");
        }
    },
};
// Handle ETH withdrawal from balance menu
async function handleWithdrawEth(ctx) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ No wallet found. Create one first with /start");
            return;
        }
        // Get current ETH balance
        const ethBalance = await (0, token_wallet_1.getEthBalance)(wallet.address);
        const ethBalanceFormatted = (0, viem_1.formatEther)(BigInt(ethBalance));
        if (parseFloat(ethBalanceFormatted) < 0.001) {
            await ctx.reply(`⚠️ **Insufficient ETH Balance**\n\n` +
                `Current ETH: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
                `You need at least 0.001 ETH to cover gas fees for withdrawal.`, { parse_mode: "Markdown" });
            return;
        }
        ctx.session.currentAction = "withdraw_eth_address";
        await ctx.reply(`📤 **Withdraw ETH**\n\n` +
            `Current Balance: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
            `Please enter the destination address where you want to send your ETH:\n\n` +
            `**Note**: Make sure the address is correct. ETH transactions cannot be reversed!`, { parse_mode: "Markdown" });
    }
    catch (error) {
        console.error("Error in ETH withdrawal:", error);
        await ctx.reply("❌ Error preparing ETH withdrawal. Please try again.");
    }
}
// Handle USDC withdrawal from balance menu  
async function handleWithdrawUsdc(ctx) {
    try {
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Please start the bot first with /start command.");
            return;
        }
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ No wallet found. Create one first with /start");
            return;
        }
        // Get current USDC balance from regular wallet
        const tokenBalances = await (0, token_wallet_1.getMultipleTokenBalances)([constants_1.BASE_TOKENS.USDC], wallet.address);
        let usdcBalance = tokenBalances[0];
        let usdcBalanceFormatted = "0.00";
        let regularWalletBalance = "0.00";
        if (usdcBalance && parseFloat(usdcBalance.balance) > 0) {
            regularWalletBalance = (0, token_wallet_1.formatTokenAmount)(usdcBalance.balance, 6, 2);
            usdcBalanceFormatted = regularWalletBalance;
        }
        // Also check Smart Wallet balance if user has one
        let smartWalletBalance = "0.00";
        const coinbaseWallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
        if (coinbaseWallet) {
            smartWalletBalance = await (0, coinbase_wallet_1.getCoinbaseWalletUSDCBalance)(coinbaseWallet.smartAccount.address);
            // If regular wallet has no balance, use Smart Wallet balance for display
            if (parseFloat(regularWalletBalance) === 0 && parseFloat(smartWalletBalance) > 0) {
                usdcBalanceFormatted = smartWalletBalance;
                // Create a mock balance object for Smart Wallet
                usdcBalance = {
                    address: constants_1.BASE_TOKENS.USDC,
                    symbol: "USDC",
                    decimals: 6,
                    balance: (parseFloat(smartWalletBalance) * 1000000).toString() // Convert back to raw units
                };
            }
        }
        // Check if user has any USDC in either wallet
        if (parseFloat(usdcBalanceFormatted) === 0) {
            await ctx.reply(`⚠️ **No USDC Balance**\n\n` +
                `You don't have any USDC in your wallets to withdraw.\n\n` +
                `Regular Wallet: ${regularWalletBalance} USDC\n` +
                `Smart Wallet: ${smartWalletBalance} USDC\n\n` +
                `Use 📥 Deposit to add USDC to your wallet first.`, { parse_mode: "Markdown" });
            return;
        }
        // Determine gasless availability
        let gaslessAvailable = coinbaseWallet && parseFloat(smartWalletBalance) > 0.01; // Need at least $0.01 for gas
        ctx.session.currentAction = "withdraw_usdc_address";
        ctx.session.tempData = {
            usdcBalance: usdcBalance.balance,
            usdcBalanceFormatted,
            hasSmartWallet: !!coinbaseWallet,
            smartWalletBalance,
            regularWalletBalance,
            // Track which wallet has the balance for withdrawal
            usingSmartWallet: parseFloat(regularWalletBalance) === 0 && parseFloat(smartWalletBalance) > 0
        };
        let balanceInfo = `\n**Wallet Balances:**\n`;
        balanceInfo += `• Regular Wallet: ${regularWalletBalance} USDC\n`;
        balanceInfo += `• Smart Wallet: ${smartWalletBalance} USDC\n`;
        const gaslessInfo = gaslessAvailable
            ? `\n🦑 **Gasless Withdrawal Available!**\nYou can withdraw with USDC gas payment (no ETH needed)\n`
            : coinbaseWallet
                ? `\n⚠️ **Low Smart Wallet Balance**\nNeed at least $0.01 USDC in Smart Wallet for gasless withdrawal\n`
                : `\n⛽ **Gas Fee**: Will be paid with ETH from your wallet\n`;
        await ctx.reply(`📤 **Withdraw USDC**\n\n` +
            `Total Available: ${usdcBalanceFormatted} USDC${balanceInfo}${gaslessInfo}\n` +
            `Please enter the destination address where you want to send your USDC:\n\n` +
            `**Note**: Make sure the address is correct. USDC transactions cannot be reversed!`, { parse_mode: "Markdown" });
    }
    catch (error) {
        console.error("Error in USDC withdrawal:", error);
        await ctx.reply("❌ Error preparing USDC withdrawal. Please try again.");
    }
}
// Handle text input for withdrawal flows
async function handleWithdrawTextInput(ctx, text) {
    const action = ctx.session.currentAction;
    switch (action) {
        case "withdraw_eth_address":
            await handleWithdrawEthAddressInput(ctx, text);
            break;
        case "withdraw_usdc_address":
            await handleWithdrawUsdcAddressInput(ctx, text);
            break;
        case "withdraw_eth_amount":
            await handleWithdrawEthAmountInput(ctx, text);
            break;
        case "withdraw_usdc_amount":
            await handleWithdrawUsdcAmountInput(ctx, text);
            break;
        default:
            await ctx.reply("❌ Unknown withdrawal step. Please start over with /balance");
            ctx.session.currentAction = undefined;
            ctx.session.tempData = {};
            break;
    }
}
// Handle address input for ETH withdrawal
async function handleWithdrawEthAddressInput(ctx, address) {
    try {
        // Basic address validation
        if (!address.startsWith('0x') || address.length !== 42) {
            await ctx.reply("❌ **Invalid Address**\n\n" +
                "Please enter a valid Ethereum address (0x...). The address must be 42 characters long.", { parse_mode: "Markdown" });
            return;
        }
        ctx.session.currentAction = "withdraw_eth_amount";
        ctx.session.tempData = { destinationAddress: address };
        const userId = ctx.session.userId;
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        const ethBalance = await (0, token_wallet_1.getEthBalance)(wallet.address);
        const ethBalanceFormatted = (0, viem_1.formatEther)(BigInt(ethBalance));
        await ctx.reply(`💸 **Confirm ETH Withdrawal**\n\n` +
            `**Destination**: \`${address}\`\n` +
            `**Available**: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
            `Please enter the amount of ETH to withdraw (or 'max' for maximum amount):\n\n` +
            `**Note**: Gas fees (~0.0001 ETH) will be deducted automatically.`, { parse_mode: "Markdown" });
    }
    catch (error) {
        console.error("Error processing ETH address:", error);
        await ctx.reply("❌ Error processing address. Please try again.");
    }
}
// Handle address input for USDC withdrawal  
async function handleWithdrawUsdcAddressInput(ctx, address) {
    try {
        // Basic address validation
        if (!address.startsWith('0x') || address.length !== 42) {
            await ctx.reply("❌ **Invalid Address**\n\n" +
                "Please enter a valid Ethereum address (0x...). The address must be 42 characters long.", { parse_mode: "Markdown" });
            return;
        }
        ctx.session.currentAction = "withdraw_usdc_amount";
        ctx.session.tempData = {
            ...ctx.session.tempData,
            destinationAddress: address
        };
        const { usdcBalanceFormatted } = ctx.session.tempData;
        await ctx.reply(`💸 **Confirm USDC Withdrawal**\n\n` +
            `**Destination**: \`${address}\`\n` +
            `**Available**: ${usdcBalanceFormatted} USDC\n\n` +
            `Please enter the amount of USDC to withdraw (or 'max' for maximum amount):`, { parse_mode: "Markdown" });
    }
    catch (error) {
        console.error("Error processing USDC address:", error);
        await ctx.reply("❌ Error processing address. Please try again.");
    }
}
// Handle amount input for ETH withdrawal
async function handleWithdrawEthAmountInput(ctx, amount) {
    try {
        const userId = ctx.session.userId;
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        const { destinationAddress } = ctx.session.tempData;
        if (!wallet) {
            await ctx.reply("❌ Wallet not found. Please try again.");
            return;
        }
        const ethBalance = await (0, token_wallet_1.getEthBalance)(wallet.address);
        const ethBalanceFormatted = (0, viem_1.formatEther)(BigInt(ethBalance));
        const availableBalance = parseFloat(ethBalanceFormatted);
        let withdrawAmount;
        if (amount.toLowerCase() === 'max') {
            // Leave some ETH for gas fees
            withdrawAmount = Math.max(0, availableBalance - 0.001);
        }
        else {
            withdrawAmount = parseFloat(amount);
            if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
                await ctx.reply("❌ Please enter a valid amount or 'max'.");
                return;
            }
        }
        if (withdrawAmount > availableBalance - 0.001) {
            await ctx.reply(`❌ **Insufficient Balance**\n\n` +
                `Requested: ${withdrawAmount.toFixed(6)} ETH\n` +
                `Available: ${(availableBalance - 0.001).toFixed(6)} ETH (after gas)`, { parse_mode: "Markdown" });
            return;
        }
        if (withdrawAmount < 0.001) {
            await ctx.reply("❌ Minimum withdrawal amount is 0.001 ETH.");
            return;
        }
        // Execute withdrawal
        await ctx.reply(`⏳ **Processing ETH Withdrawal**\n\n` +
            `Amount: ${withdrawAmount.toFixed(6)} ETH\n` +
            `To: \`${destinationAddress}\`\n\n` +
            `Please wait while we process your transaction...`, { parse_mode: "Markdown" });
        try {
            // Convert to wei
            const amountInWei = (0, viem_1.parseUnits)(withdrawAmount.toString(), 18);
            // Execute the actual withdrawal using existing function
            const receipt = await (0, token_wallet_1.withdrawEth)(wallet, {
                from: wallet.address,
                to: destinationAddress,
                amount: amountInWei.toString(),
                gasPrice: "2000000000", // 2 gwei (will be overridden by EIP-1559 fees)
            });
            await ctx.reply(`✅ **ETH Withdrawal Successful!**\n\n` +
                `Amount: ${withdrawAmount.toFixed(6)} ETH\n` +
                `Destination: \`${destinationAddress}\`\n` +
                `Transaction: \`${receipt.transactionHash}\`\n\n` +
                `Your ETH has been sent successfully! 🎉`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("📥 Deposit", "deposit")
                    .text("📊 Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
            });
        }
        catch (txError) {
            console.error("ETH withdrawal transaction failed:", txError);
            await ctx.reply(`❌ **ETH Withdrawal Failed**\n\n` +
                `Error: ${txError.message || "Unknown error"}\n\n` +
                `Please try again or contact support if the issue persists.`, { parse_mode: "Markdown" });
        }
        // Clear session
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
    catch (error) {
        console.error("Error in ETH amount input:", error);
        await ctx.reply("❌ Error processing withdrawal. Please try again.");
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
}
// Handle amount input for USDC withdrawal
async function handleWithdrawUsdcAmountInput(ctx, amount) {
    try {
        const userId = ctx.session.userId;
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        const { destinationAddress } = ctx.session.tempData;
        if (!wallet) {
            await ctx.reply("❌ Wallet not found. Please try again.");
            return;
        }
        // Get fresh USDC balance right before withdrawal to avoid race conditions
        const tokenBalances = await (0, token_wallet_1.getMultipleTokenBalances)([constants_1.BASE_TOKENS.USDC], wallet.address);
        const usdcBalance = tokenBalances[0];
        if (!usdcBalance || parseFloat(usdcBalance.balance) === 0) {
            await ctx.reply(`❌ **No USDC Balance**\n\n` +
                `Your USDC balance is now empty. The balance may have changed since you started the withdrawal.`, { parse_mode: "Markdown" });
            return;
        }
        const usdcBalanceFormatted = (0, token_wallet_1.formatTokenAmount)(usdcBalance.balance, 6, 2);
        const availableBalance = parseFloat(usdcBalanceFormatted);
        let withdrawAmount;
        let useExactBalance = false;
        if (amount.toLowerCase() === 'max') {
            // For max withdrawal, use the exact raw balance to avoid rounding issues
            withdrawAmount = availableBalance;
            useExactBalance = true;
        }
        else {
            withdrawAmount = parseFloat(amount);
            if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
                await ctx.reply("❌ Please enter a valid amount or 'max'.");
                return;
            }
            if (withdrawAmount > availableBalance) {
                await ctx.reply(`❌ **Insufficient Balance**\n\n` +
                    `Requested: ${withdrawAmount.toFixed(2)} USDC\n` +
                    `Available: ${availableBalance.toFixed(2)} USDC`, { parse_mode: "Markdown" });
                return;
            }
        }
        if (withdrawAmount < 0.01) {
            await ctx.reply("❌ Minimum withdrawal amount is 0.01 USDC.");
            return;
        }
        // Execute withdrawal
        await ctx.reply(`⏳ **Processing USDC Withdrawal**\n\n` +
            `Amount: ${withdrawAmount.toFixed(2)} USDC\n` +
            `To: \`${destinationAddress}\`\n\n` +
            `Please wait while we process your transaction...`, { parse_mode: "Markdown" });
        try {
            // Check if user has Coinbase Smart Wallet for gasless withdrawal
            const coinbaseWallet = await (0, coinbase_wallet_1.getCoinbaseSmartWallet)(userId);
            const { usingSmartWallet } = ctx.session.tempData;
            let receipt;
            let isGasless = false;
            // If balance is only in Smart Wallet, force Smart Wallet usage
            if (usingSmartWallet && !coinbaseWallet) {
                await ctx.reply(`❌ **Smart Wallet Required**\n\n` +
                    `Your USDC balance is in your Smart Wallet, but Smart Wallet is not available.\n\n` +
                    `Please contact support.`, { parse_mode: "Markdown" });
                return;
            }
            // Check actual balances in real-time before withdrawal
            let regularWalletUsdcBalance = "0";
            let smartWalletUsdcBalance = "0";
            // Get real-time balance from regular wallet
            try {
                const regularBalance = await (0, token_wallet_1.getTokenBalance)(constants_1.BASE_TOKENS.USDC, wallet.address);
                regularWalletUsdcBalance = (0, token_wallet_1.formatTokenAmount)(regularBalance, 6, 2);
                console.log(`💰 Regular wallet ${wallet.address}: ${regularWalletUsdcBalance} USDC`);
            }
            catch (error) {
                console.error("Error checking regular wallet balance:", error);
            }
            // Get real-time balance from Smart Wallet if available
            if (coinbaseWallet) {
                try {
                    smartWalletUsdcBalance = await (0, coinbase_wallet_1.getCoinbaseWalletUSDCBalance)(coinbaseWallet.smartAccount.address);
                    console.log(`💰 Smart wallet ${coinbaseWallet.smartAccount.address}: ${smartWalletUsdcBalance} USDC`);
                }
                catch (error) {
                    console.error("Error checking Smart wallet balance:", error);
                }
            }
            const regularHasBalance = parseFloat(regularWalletUsdcBalance) >= withdrawAmount;
            const smartHasBalance = parseFloat(smartWalletUsdcBalance) >= withdrawAmount;
            console.log(`🔍 Withdrawal decision: Need ${withdrawAmount} USDC`);
            console.log(`  - Regular wallet has sufficient: ${regularHasBalance}`);
            console.log(`  - Smart wallet has sufficient: ${smartHasBalance}`);
            if (!regularHasBalance && !smartHasBalance) {
                await ctx.reply(`❌ **Insufficient Balance**\n\n` +
                    `Need: ${withdrawAmount.toFixed(2)} USDC\n` +
                    `Regular Wallet: ${regularWalletUsdcBalance} USDC\n` +
                    `Smart Wallet: ${smartWalletUsdcBalance} USDC\n\n` +
                    `None of your wallets have sufficient balance.`, { parse_mode: "Markdown" });
                return;
            }
            // Prioritize Smart Wallet if it has sufficient balance
            if (smartHasBalance && coinbaseWallet) {
                console.log(`🦑 Using Smart Wallet for gasless withdrawal`);
                let transferAmountString = withdrawAmount.toFixed(6);
                let actualWithdrawAmount = withdrawAmount;
                if (useExactBalance) {
                    // For max withdrawal, account for gas reserve in Smart Wallet
                    const gasReserve = 0.01; // Reserve 0.01 USDC for gas (matches coinbase-wallet.ts)
                    const availableForWithdrawal = parseFloat(smartWalletUsdcBalance) - gasReserve;
                    if (availableForWithdrawal > 0) {
                        actualWithdrawAmount = availableForWithdrawal;
                        transferAmountString = actualWithdrawAmount.toFixed(6);
                        console.log(`💡 Smart max withdrawal: ${smartWalletUsdcBalance} USDC - ${gasReserve} gas reserve = ${actualWithdrawAmount.toFixed(6)} USDC`);
                    }
                    else {
                        await ctx.reply(`❌ **Insufficient Balance for Max Withdrawal**\n\n` +
                            `Smart Wallet: ${smartWalletUsdcBalance} USDC\n` +
                            `Gas Reserve: ${gasReserve.toFixed(2)} USDC\n` +
                            `Available: ${availableForWithdrawal.toFixed(2)} USDC\n\n` +
                            `Not enough USDC after gas reserve.`, { parse_mode: "Markdown" });
                        return;
                    }
                }
                const gaslessResult = await (0, coinbase_wallet_1.transferUsdcGasless)(userId, destinationAddress, transferAmountString);
                if (gaslessResult.success) {
                    receipt = { transactionHash: gaslessResult.txHash };
                    isGasless = true;
                    console.log(`✅ Gasless withdrawal successful: ${gaslessResult.txHash}`);
                }
                else {
                    console.log(`⚠️ Gasless withdrawal failed: ${gaslessResult.error}`);
                    // Only fall back to regular if regular wallet has balance
                    if (regularHasBalance) {
                        console.log(`🔄 Falling back to regular wallet withdrawal`);
                        let fallbackAmountString = withdrawAmount.toFixed(6);
                        if (useExactBalance) {
                            const regularBalance = await (0, token_wallet_1.getTokenBalance)(constants_1.BASE_TOKENS.USDC, wallet.address);
                            fallbackAmountString = (0, token_wallet_1.formatTokenAmount)(regularBalance, 6, 6);
                        }
                        receipt = await (0, token_wallet_1.transferUsdc)(wallet, destinationAddress, fallbackAmountString);
                    }
                    else {
                        await ctx.reply(`❌ **Withdrawal Failed**\n\n` +
                            `Gasless withdrawal failed and regular wallet has insufficient balance.\n\n` +
                            `Error: ${gaslessResult.error}`, { parse_mode: "Markdown" });
                        return;
                    }
                }
            }
            else if (regularHasBalance) {
                console.log(`💳 Using regular wallet for withdrawal`);
                let transferAmountString = withdrawAmount.toFixed(6);
                if (useExactBalance) {
                    const regularBalance = await (0, token_wallet_1.getTokenBalance)(constants_1.BASE_TOKENS.USDC, wallet.address);
                    transferAmountString = (0, token_wallet_1.formatTokenAmount)(regularBalance, 6, 6);
                }
                receipt = await (0, token_wallet_1.transferUsdc)(wallet, destinationAddress, transferAmountString);
            }
            else {
                await ctx.reply(`❌ **No Suitable Wallet**\n\n` +
                    `Cannot withdraw ${withdrawAmount.toFixed(2)} USDC:\n` +
                    `• Regular Wallet: ${regularWalletUsdcBalance} USDC\n` +
                    `• Smart Wallet: ${smartWalletUsdcBalance || "Not available"} USDC`, { parse_mode: "Markdown" });
                return;
            }
            // Success message with gas payment info
            const gasFeeInfo = isGasless
                ? "\n**Gas Fee**: Paid with USDC 💰 (gasless!)"
                : "\n**Gas Fee**: Paid with ETH ⛽";
            await ctx.reply(`✅ **USDC Withdrawal Successful!**\n\n` +
                `Amount: ${withdrawAmount.toFixed(2)} USDC\n` +
                `Destination: \`${destinationAddress}\`\n` +
                `Transaction: \`${receipt.transactionHash}\`${gasFeeInfo}\n\n` +
                `Your USDC has been sent successfully! 🎉`, {
                parse_mode: "Markdown",
                reply_markup: new grammy_1.InlineKeyboard()
                    .text("📥 Deposit", "deposit")
                    .text("📊 Portfolio", "view_portfolio")
                    .row()
                    .text("💰 Check Balance", "check_balance")
            });
        }
        catch (txError) {
            console.error("USDC withdrawal transaction failed:", txError);
            await ctx.reply(`❌ **USDC Withdrawal Failed**\n\n` +
                `Error: ${txError.message || "Unknown error"}\n\n` +
                `Please try again or contact support if the issue persists.`, { parse_mode: "Markdown" });
        }
        // Clear session
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
    catch (error) {
        console.error("Error in USDC amount input:", error);
        await ctx.reply("❌ Error processing withdrawal. Please try again.");
        ctx.session.currentAction = undefined;
        ctx.session.tempData = {};
    }
}
