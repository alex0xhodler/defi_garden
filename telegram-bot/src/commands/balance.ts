import { BotContext } from "../context";
import { getWallet, getEthBalance, getMultipleTokenBalances, withdrawEth, executeContractMethod, formatTokenAmount, transferUsdc } from "../lib/token-wallet";
import { formatBalanceMessage } from "../utils/formatters";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";
import { Address, parseUnits, formatEther } from "viem";
import { TokenInfo } from "../types/config";
import { BASE_TOKENS, isRpcConfigured } from "../utils/constants";
import { erc20Abi } from "../utils/abis";

// Handler for balance command
export const balanceHandler: CommandHandler = {
  command: "balance",
  description: "Show current ETH + filtered ERC-20 balances",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);

      if (!wallet) {
        await ctx.reply(
          "❌ You don't have a wallet yet.\n\n" +
            "Use /create to create a new wallet or /import to import an existing one."
        );
        return;
      }

      // Check RPC configuration first
      if (!isRpcConfigured()) {
        await ctx.reply(
          "❌ **RPC Configuration Error**\n\n" +
          "Your RPC endpoint is not properly configured. Please:\n\n" +
          "1. Get a proper RPC endpoint from QuickNode or similar\n" +
          "2. Update your `.env` file:\n" +
          "   `QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`\n" +
          "3. Restart the bot\n\n" +
          "**Current RPC**: Using rate-limited public endpoint\n" +
          "**Solution**: Get a dedicated RPC with higher limits",
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.reply("⏳ Fetching your balances...");

      try {
        // Get ETH balance
        const ethBalance = await getEthBalance(wallet.address);

        // Get token balances - only check USDC to reduce RPC calls
        const tokenBalances = await getMultipleTokenBalances(
          [BASE_TOKENS.USDC], // Only check USDC to minimize RPC calls
          wallet.address as Address
        );

        // Create actions keyboard
        const keyboard = new InlineKeyboard()
          .text("📥 Deposit", "deposit")
          .text("🚀 Start Earning", "zap_funds")
          .row()
          .text("📤 Withdraw ETH", "withdraw_eth")
          .text("📤 Withdraw USDC", "withdraw_usdc")
          .row()
          .text("🔄 Refresh", "check_balance");

        // Format and send balance message
        const message = formatBalanceMessage(ethBalance, tokenBalances);

        await ctx.reply(message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });

      } catch (rpcError: any) {
        console.error("RPC Error in balance command:", rpcError);
        
        if (rpcError.message === "RPC_NOT_CONFIGURED") {
          await ctx.reply(
            "❌ **RPC Configuration Error**\n\n" +
            "Please update your `.env` file with a proper RPC endpoint:\n" +
            "`QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`",
            { parse_mode: "Markdown" }
          );
        } else if (rpcError?.cause?.status === 429 || rpcError?.details?.includes('rate limit')) {
          await ctx.reply(
            "⏳ **Rate Limit Hit**\n\n" +
            "Your RPC endpoint is being rate limited. Please:\n\n" +
            "• Wait a few minutes and try again\n" +
            "• Consider upgrading to a higher-tier RPC plan\n" +
            "• Or use a different RPC provider\n\n" +
            "Current endpoint appears to have low rate limits."
          );
        } else {
          await ctx.reply(
            "❌ **Network Error**\n\n" +
            "Failed to fetch balances. This might be due to:\n\n" +
            "• RPC endpoint issues\n" +
            "• Network connectivity problems\n" +
            "• Temporary service outage\n\n" +
            "Please try again in a few minutes."
          );
        }
      }
    } catch (error) {
      console.error("Error in balance command:", error);
      await ctx.reply(
        "❌ An unexpected error occurred while fetching your balances. Please try again later."
      );
    }
  },
};

// Handle ETH withdrawal from balance menu
export async function handleWithdrawEth(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply("❌ No wallet found. Create one first with /start");
      return;
    }

    // Get current ETH balance
    const ethBalance = await getEthBalance(wallet.address);
    const ethBalanceFormatted = formatEther(BigInt(ethBalance));
    
    if (parseFloat(ethBalanceFormatted) < 0.001) {
      await ctx.reply(
        `⚠️ **Insufficient ETH Balance**\n\n` +
        `Current ETH: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
        `You need at least 0.001 ETH to cover gas fees for withdrawal.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    ctx.session.currentAction = "withdraw_eth_address";
    await ctx.reply(
      `📤 **Withdraw ETH**\n\n` +
      `Current Balance: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
      `Please enter the destination address where you want to send your ETH:\n\n` +
      `**Note**: Make sure the address is correct. ETH transactions cannot be reversed!`,
      { parse_mode: "Markdown" }
    );
    
  } catch (error) {
    console.error("Error in ETH withdrawal:", error);
    await ctx.reply("❌ Error preparing ETH withdrawal. Please try again.");
  }
}

// Handle USDC withdrawal from balance menu  
export async function handleWithdrawUsdc(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply("❌ No wallet found. Create one first with /start");
      return;
    }

    // Get current USDC balance
    const tokenBalances = await getMultipleTokenBalances(
      [BASE_TOKENS.USDC],
      wallet.address as Address
    );
    
    const usdcBalance = tokenBalances[0];
    if (!usdcBalance || parseFloat(usdcBalance.balance) === 0) {
      await ctx.reply(
        `⚠️ **No USDC Balance**\n\n` +
        `You don't have any USDC in your wallet to withdraw.\n\n` +
        `Use 📥 Deposit to add USDC to your wallet first.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const usdcBalanceFormatted = formatTokenAmount(usdcBalance.balance, 6, 2);
    
    ctx.session.currentAction = "withdraw_usdc_address";
    ctx.session.tempData = {
      usdcBalance: usdcBalance.balance,
      usdcBalanceFormatted
    };
    
    await ctx.reply(
      `📤 **Withdraw USDC**\n\n` +
      `Current Balance: ${usdcBalanceFormatted} USDC\n\n` +
      `Please enter the destination address where you want to send your USDC:\n\n` +
      `**Note**: Make sure the address is correct. USDC transactions cannot be reversed!`,
      { parse_mode: "Markdown" }
    );
    
  } catch (error) {
    console.error("Error in USDC withdrawal:", error);
    await ctx.reply("❌ Error preparing USDC withdrawal. Please try again.");
  }
}

// Handle text input for withdrawal flows
export async function handleWithdrawTextInput(ctx: BotContext, text: string): Promise<void> {
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
async function handleWithdrawEthAddressInput(ctx: BotContext, address: string): Promise<void> {
  try {
    // Basic address validation
    if (!address.startsWith('0x') || address.length !== 42) {
      await ctx.reply(
        "❌ **Invalid Address**\n\n" +
        "Please enter a valid Ethereum address (0x...). The address must be 42 characters long.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    ctx.session.currentAction = "withdraw_eth_amount";
    ctx.session.tempData = { destinationAddress: address };
    
    const userId = ctx.session.userId!;
    const wallet = await getWallet(userId);
    const ethBalance = await getEthBalance(wallet!.address);
    const ethBalanceFormatted = formatEther(BigInt(ethBalance));
    
    await ctx.reply(
      `💸 **Confirm ETH Withdrawal**\n\n` +
      `**Destination**: \`${address}\`\n` +
      `**Available**: ${parseFloat(ethBalanceFormatted).toFixed(6)} ETH\n\n` +
      `Please enter the amount of ETH to withdraw (or 'max' for maximum amount):\n\n` +
      `**Note**: Gas fees (~0.0001 ETH) will be deducted automatically.`,
      { parse_mode: "Markdown" }
    );
    
  } catch (error) {
    console.error("Error processing ETH address:", error);
    await ctx.reply("❌ Error processing address. Please try again.");
  }
}

// Handle address input for USDC withdrawal  
async function handleWithdrawUsdcAddressInput(ctx: BotContext, address: string): Promise<void> {
  try {
    // Basic address validation
    if (!address.startsWith('0x') || address.length !== 42) {
      await ctx.reply(
        "❌ **Invalid Address**\n\n" +
        "Please enter a valid Ethereum address (0x...). The address must be 42 characters long.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    ctx.session.currentAction = "withdraw_usdc_amount";
    ctx.session.tempData = {
      ...ctx.session.tempData,
      destinationAddress: address
    };
    
    const { usdcBalanceFormatted } = ctx.session.tempData!;
    
    await ctx.reply(
      `💸 **Confirm USDC Withdrawal**\n\n` +
      `**Destination**: \`${address}\`\n` +
      `**Available**: ${usdcBalanceFormatted} USDC\n\n` +
      `Please enter the amount of USDC to withdraw (or 'max' for maximum amount):`,
      { parse_mode: "Markdown" }
    );
    
  } catch (error) {
    console.error("Error processing USDC address:", error);
    await ctx.reply("❌ Error processing address. Please try again.");
  }
}

// Handle amount input for ETH withdrawal
async function handleWithdrawEthAmountInput(ctx: BotContext, amount: string): Promise<void> {
  try {
    const userId = ctx.session.userId!;
    const wallet = await getWallet(userId);
    const { destinationAddress } = ctx.session.tempData!;
    
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please try again.");
      return;
    }
    
    const ethBalance = await getEthBalance(wallet.address);
    const ethBalanceFormatted = formatEther(BigInt(ethBalance));
    const availableBalance = parseFloat(ethBalanceFormatted);
    
    let withdrawAmount: number;
    
    if (amount.toLowerCase() === 'max') {
      // Leave some ETH for gas fees
      withdrawAmount = Math.max(0, availableBalance - 0.001);
    } else {
      withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        await ctx.reply("❌ Please enter a valid amount or 'max'.");
        return;
      }
    }
    
    if (withdrawAmount > availableBalance - 0.001) {
      await ctx.reply(
        `❌ **Insufficient Balance**\n\n` +
        `Requested: ${withdrawAmount.toFixed(6)} ETH\n` +
        `Available: ${(availableBalance - 0.001).toFixed(6)} ETH (after gas)`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    
    if (withdrawAmount < 0.001) {
      await ctx.reply("❌ Minimum withdrawal amount is 0.001 ETH.");
      return;
    }
    
    // Execute withdrawal
    await ctx.reply(
      `⏳ **Processing ETH Withdrawal**\n\n` +
      `Amount: ${withdrawAmount.toFixed(6)} ETH\n` +
      `To: \`${destinationAddress}\`\n\n` +
      `Please wait while we process your transaction...`,
      { parse_mode: "Markdown" }
    );
    
    try {
      // Convert to wei
      const amountInWei = parseUnits(withdrawAmount.toString(), 18);
      
      // Execute the actual withdrawal using existing function
      const receipt = await withdrawEth(wallet, {
        from: wallet.address as Address,
        to: destinationAddress as Address,
        amount: amountInWei.toString(),
        gasPrice: "2000000000", // 2 gwei (will be overridden by EIP-1559 fees)
      });
      
      await ctx.reply(
        `✅ **ETH Withdrawal Successful!**\n\n` +
        `Amount: ${withdrawAmount.toFixed(6)} ETH\n` +
        `Destination: \`${destinationAddress}\`\n` +
        `Transaction: \`${receipt.transactionHash}\`\n\n` +
        `Your ETH has been sent successfully! 🎉`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("📥 Deposit", "deposit")
            .text("📊 Portfolio", "view_portfolio")
            .row()
            .text("💰 Check Balance", "check_balance")
        }
      );
      
    } catch (txError: any) {
      console.error("ETH withdrawal transaction failed:", txError);
      await ctx.reply(
        `❌ **ETH Withdrawal Failed**\n\n` +
        `Error: ${txError.message || "Unknown error"}\n\n` +
        `Please try again or contact support if the issue persists.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Clear session
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
    
  } catch (error) {
    console.error("Error in ETH amount input:", error);
    await ctx.reply("❌ Error processing withdrawal. Please try again.");
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
  }
}

// Handle amount input for USDC withdrawal
async function handleWithdrawUsdcAmountInput(ctx: BotContext, amount: string): Promise<void> {
  try {
    const userId = ctx.session.userId!;
    const wallet = await getWallet(userId);
    const { destinationAddress } = ctx.session.tempData!;
    
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please try again.");
      return;
    }
    
    // Get fresh USDC balance right before withdrawal to avoid race conditions
    const tokenBalances = await getMultipleTokenBalances(
      [BASE_TOKENS.USDC],
      wallet.address as Address
    );
    
    const usdcBalance = tokenBalances[0];
    if (!usdcBalance || parseFloat(usdcBalance.balance) === 0) {
      await ctx.reply(
        `❌ **No USDC Balance**\n\n` +
        `Your USDC balance is now empty. The balance may have changed since you started the withdrawal.`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    
    const usdcBalanceFormatted = formatTokenAmount(usdcBalance.balance, 6, 2);
    const availableBalance = parseFloat(usdcBalanceFormatted);
    
    let withdrawAmount: number;
    let useExactBalance = false;
    
    if (amount.toLowerCase() === 'max') {
      // For max withdrawal, use the exact raw balance to avoid rounding issues
      withdrawAmount = availableBalance;
      useExactBalance = true;
    } else {
      withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        await ctx.reply("❌ Please enter a valid amount or 'max'.");
        return;
      }
      
      if (withdrawAmount > availableBalance) {
        await ctx.reply(
          `❌ **Insufficient Balance**\n\n` +
          `Requested: ${withdrawAmount.toFixed(2)} USDC\n` +
          `Available: ${availableBalance.toFixed(2)} USDC`,
          { parse_mode: "Markdown" }
        );
        return;
      }
    }
    
    if (withdrawAmount < 0.01) {
      await ctx.reply("❌ Minimum withdrawal amount is 0.01 USDC.");
      return;
    }
    
    // Execute withdrawal
    await ctx.reply(
      `⏳ **Processing USDC Withdrawal**\n\n` +
      `Amount: ${withdrawAmount.toFixed(2)} USDC\n` +
      `To: \`${destinationAddress}\`\n\n` +
      `Please wait while we process your transaction...`,
      { parse_mode: "Markdown" }
    );
    
    try {
      // For max withdrawal, use raw balance to avoid rounding issues
      // For custom amount, use the specified amount
      let transferAmountString: string;
      
      if (useExactBalance) {
        // Use raw balance directly (already in 6 decimals)
        transferAmountString = formatTokenAmount(usdcBalance.balance, 6, 6);
      } else {
        transferAmountString = withdrawAmount.toString();
      }
      
      // Execute the actual USDC transfer using new function
      const receipt = await transferUsdc(
        wallet,
        destinationAddress as Address,
        transferAmountString
      );
      
      await ctx.reply(
        `✅ **USDC Withdrawal Successful!**\n\n` +
        `Amount: ${withdrawAmount.toFixed(2)} USDC\n` +
        `Destination: \`${destinationAddress}\`\n` +
        `Transaction: \`${receipt.transactionHash}\`\n\n` +
        `Your USDC has been sent successfully! 🎉`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("📥 Deposit", "deposit")
            .text("📊 Portfolio", "view_portfolio")
            .row()
            .text("💰 Check Balance", "check_balance")
        }
      );
      
    } catch (txError: any) {
      console.error("USDC withdrawal transaction failed:", txError);
      await ctx.reply(
        `❌ **USDC Withdrawal Failed**\n\n` +
        `Error: ${txError.message || "Unknown error"}\n\n` +
        `Please try again or contact support if the issue persists.`,
        { parse_mode: "Markdown" }
      );
    }
    
    // Clear session
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
    
  } catch (error) {
    console.error("Error in USDC amount input:", error);
    await ctx.reply("❌ Error processing withdrawal. Please try again.");
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
  }
}

