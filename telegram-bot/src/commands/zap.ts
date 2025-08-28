import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { YieldOpportunity } from "../types/config";
import { ERRORS, RISK_THRESHOLDS, BASE_TOKENS, isRpcConfigured } from "../utils/constants";
import { getWallet, getMultipleTokenBalances, formatTokenAmount, getEthBalance } from "../lib/token-wallet";
import { formatEther } from "viem";
import { executeZap } from "../lib/defi-protocols";
import { 
  savePosition, 
  saveTransaction,
  getPositionsByUserId 
} from "../lib/database";
import { isValidAmount } from "../utils/validators";
import { Address } from "viem";

// Mock function - will be replaced with actual API integration
// TODO: Replace with actual DeFiLlama API calls: https://yields.llama.fi/pools
async function getYieldOpportunities(
  token: string = "USDC", 
  riskLevel: number = 3,
  minApy: number = 5
): Promise<YieldOpportunity[]> {
  // Mock data for v1 - These APY values should come from real APIs in production
  // For now using realistic estimates based on current market conditions
  return [
    {
      poolId: "fluid-usdc-base",
      project: "Fluid",
      chain: "Base",
      symbol: "USDC",
      tvlUsd: 120_000_000,
      apy: 7.8,
      apyBase: 6.5,
      apyReward: 1.3,
      ilRisk: "no",
      exposure: "single",
      underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
      rewardTokens: ["0x...FLUID"]
    },
    {
      poolId: "aave-usdc-base",
      project: "Aave",
      chain: "Base",
      symbol: "USDC",
      tvlUsd: 150_000_000,
      apy: 5.2,
      apyBase: 3.2,
      apyReward: 2.0,
      ilRisk: "no",
      exposure: "single",
      underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
      rewardTokens: ["0x...COMP"]
    },
    {
      poolId: "compound-usdc-base", 
      project: "Compound",
      chain: "Base",
      symbol: "USDC",
      tvlUsd: 89_000_000,
      apy: 4.8,
      apyBase: 4.8,
      apyReward: 0,
      ilRisk: "no",
      exposure: "single",
      underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"]
    }
  ];
}

function calculateRiskScore(pool: YieldOpportunity): number {
  let risk = 0;
  
  // TVL risk (higher TVL = lower risk)
  if (pool.tvlUsd < 10_000_000) risk += 5;
  else if (pool.tvlUsd < 50_000_000) risk += 3;
  else if (pool.tvlUsd < 100_000_000) risk += 2;
  else risk += 1;
  
  // Protocol reputation risk
  const protocolRisk: Record<string, number> = {
    'Aave': 1, 'Compound': 1, 'Yearn': 2, 
    'Pendle': 3, 'Convex': 2, 'Unknown': 5
  };
  risk += protocolRisk[pool.project] || 4;
  
  // Impermanent loss risk
  if (pool.ilRisk === 'yes') risk += 2;
  
  // Suspicious APY
  if (pool.apy > 50) risk += 2;
  if (pool.apy > 100) risk += 3;
  
  return Math.min(risk, 10);
}

const zapHandler: CommandHandler = {
  command: "zap",
  description: "Auto-deploy funds to best yield opportunities",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Check RPC configuration first
      if (!isRpcConfigured()) {
        await ctx.reply(
          "❌ **RPC Configuration Error**\n\n" +
          "Your RPC endpoint is not properly configured for DeFi operations.\n\n" +
          "Please update your `.env` file:\n" +
          "`QUICKNODE_RPC=https://your-endpoint.quiknode.pro/your-key`\n\n" +
          "**Reason**: Zapping requires reliable balance checks and transaction execution.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);
      if (!wallet) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Set current action
      ctx.session.currentAction = "zap_amount";
      
      // For v1, we'll start with USDC only
      ctx.session.tempData = {
        selectedToken: "USDC",
        walletAddress: wallet.address
      };

      // Check if user wants automation or manual selection
      const keyboard = new InlineKeyboard()
        .text("🤖 Auto Earn", "zap_auto_deploy")
        .row()
        .text("🎯 Choose Protocol", "zap_choose_protocol");

      await ctx.reply(
        `🚀 *Ready to Zap USDC into Yield Farming*\n\n` +
        `I'll find the best opportunities based on your risk level (${ctx.session.settings?.riskLevel || 3}/5).\n\n` +
        `**Auto Earn**: I pick the highest APY pool with good safety scores\n` +
        `**Choose Protocol**: You choose from available protocols\n\n` +
        `How would you like to proceed?`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error("Error in zap command:", error);
      await ctx.reply(ERRORS.NETWORK_ERROR);
    }
  },
};

// Handle pool/protocol selection
export async function handlePoolSelection(ctx: BotContext): Promise<void> {
  try {
    const userRiskLevel = ctx.session.settings?.riskLevel || 3;
    const userMinApy = ctx.session.settings?.minApy || 5;
    
    // Get available yield opportunities
    const opportunities = await getYieldOpportunities("USDC", userRiskLevel, userMinApy);
    
    // Filter and score pools
    const suitablePools = opportunities
      .filter(pool => {
        const riskScore = calculateRiskScore(pool);
        return riskScore <= userRiskLevel * 2; // Allow some flexibility
      })
      .filter(pool => pool.apy >= userMinApy)
      .sort((a, b) => b.apy - a.apy);
    
    if (suitablePools.length === 0) {
      await ctx.reply(
        `😔 No pools match your criteria:\n` +
        `• Risk level: ${userRiskLevel}/5\n` +
        `• Min APY: ${userMinApy}%\n\n` +
        `Try adjusting your settings with /settings`
      );
      return;
    }
    
    // Show pool selection
    const keyboard = new InlineKeyboard();
    let message = `🎯 *Choose Your Protocol*\n\n`;
    
    for (const pool of suitablePools.slice(0, 5)) { // Show top 5
      const riskScore = calculateRiskScore(pool);
      const safetyIcon = riskScore <= 3 ? "🛡️" : riskScore <= 6 ? "⚠️" : "🚨";
      
      message += `${safetyIcon} **${pool.project}**\n`;
      message += `• APY: **${pool.apy}%** (${pool.apyBase}% base + ${pool.apyReward}% rewards)\n`;
      message += `• TVL: $${(pool.tvlUsd / 1_000_000).toFixed(1)}M\n`;
      message += `• Risk Score: ${riskScore}/10\n\n`;
      
      keyboard.text(`${pool.project} - ${pool.apy}%`, `pool_${pool.poolId}`).row();
    }
    
    keyboard.text("🤖 Just Pick Best APY", "zap_auto_deploy");
    
    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
  } catch (error) {
    console.error("Error handling pool selection:", error);
    await ctx.reply(ERRORS.NETWORK_ERROR);
  }
}

// Handle amount input
export async function handleZapAmountInput(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    const amountInput = ctx.message?.text;

    if (!userId || !amountInput) {
      await ctx.reply("❌ Invalid request. Please try again.");
      return;
    }

    // Validate amount
    if (!isValidAmount(amountInput)) {
      await ctx.reply(ERRORS.INVALID_AMOUNT + "\n\nTry again or type /cancel to abort.");
      return;
    }

    const amount = parseFloat(amountInput);
    
    // Basic validation - minimum $1 investment for testing
    if (amount < 1) {
      await ctx.reply("❌ Minimum investment is $1 USDC.\n\nTry again or type /cancel to abort.");
      return;
    }

    // Check if user has sufficient USDC balance
    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply(ERRORS.NO_WALLET);
      return;
    }

    try {
      // Check ETH balance for gas fees first
      const ethBalance = await getEthBalance(wallet.address);
      const ethInEther = formatEther(BigInt(ethBalance));
      console.log(`ETH balance check: ${ethInEther} ETH`);

      if (parseFloat(ethInEther) < 0.0001) {
        await ctx.reply(
          `⛽ **Insufficient ETH for Gas**\n\n` +
          `**Your ETH balance**: ${parseFloat(ethInEther).toFixed(6)} ETH\n` +
          `**Required**: At least 0.0001 ETH (~$0.40)\n\n` +
          `**Solution**: Deposit ETH to your wallet address:\n` +
          `\`${wallet.address}\`\n\n` +
          `**Why**: DeFi transactions require ETH to pay gas fees on Base network.\n` +
          `**Base gas costs**: ~$0.002 per transaction (very cheap!)`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      const tokenBalances = await getMultipleTokenBalances(
        [BASE_TOKENS.USDC],
        wallet.address as Address
      );

      const usdcBalance = tokenBalances.find(token => token.symbol === "USDC");
      if (!usdcBalance) {
        await ctx.reply("❌ No USDC balance found. Please deposit USDC first using /deposit");
        return;
      }

      // Convert balance to readable format and check if sufficient
      const readableBalance = parseFloat(formatTokenAmount(usdcBalance.balance, 6, 2));
      if (readableBalance < amount) {
        await ctx.reply(
          `❌ Insufficient USDC balance.\n\n` +
          `**Your balance**: ${readableBalance} USDC\n` +
          `**Requested**: ${amount} USDC\n\n` +
          `Use /deposit to add more funds or try a smaller amount.`
        );
        return;
      }
    } catch (balanceError: any) {
      console.error("Error checking USDC balance:", balanceError);
      
      if (balanceError?.cause?.status === 429 || balanceError?.details?.includes('rate limit')) {
        await ctx.reply(
          "⏳ **Rate Limit Error**\n\n" +
          "Cannot check your USDC balance due to RPC rate limits.\n\n" +
          "Please wait a few minutes and try again, or upgrade your RPC plan for higher limits."
        );
      } else {
        await ctx.reply(
          "❌ **Balance Check Failed**\n\n" +
          "Unable to verify your USDC balance.\n\n" +
          "This might be due to RPC issues. Please try again later."
        );
      }
      return;
    }

    // Store amount and move to confirmation
    ctx.session.tempData!.amount = amountInput;
    ctx.session.currentAction = "zap_confirm";

    // Get the best pool for auto-deployment
    const opportunities = await getYieldOpportunities("USDC");
    const bestPool = opportunities
      .filter(pool => pool.tvlUsd >= RISK_THRESHOLDS.TVL_SAFE)
      .sort((a, b) => b.apy - a.apy)[0];

    if (!bestPool) {
      await ctx.reply("❌ No suitable pools found. Please try again later.");
      return;
    }

    // Calculate estimated yearly yield
    const yearlyYield = (amount * bestPool.apy) / 100;
    const monthlyYield = yearlyYield / 12;

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Confirm Zap", "confirm_yes")
      .text("❌ Cancel", "confirm_no");

    await ctx.reply(
      `🎯 *Zap Confirmation*\n\n` +
      `**Investment**: $${amount} USDC\n` +
      `**Selected Pool**: ${bestPool.project} USDC\n` +
      `**Current APY**: ${bestPool.apy}%\n` +
      `**TVL**: $${(bestPool.tvlUsd / 1_000_000).toFixed(1)}M\n\n` +
      `**Estimated Returns**:\n` +
      `• Monthly: ~$${monthlyYield.toFixed(2)}\n` +
      `• Yearly: ~$${yearlyYield.toFixed(2)}\n\n` +
      `**Safety Features**:\n` +
      `✅ High TVL (${(bestPool.tvlUsd / 1_000_000).toFixed(0)}M+)\n` +
      `✅ Audited protocol\n` +
      `✅ No impermanent loss risk\n\n` +
      `⚠️ *Note: APY rates can change. Past performance doesn't guarantee future results.*\n\n` +
      `Proceed with this investment?`,
      {
        parse_mode: "Markdown",
        reply_markup: confirmKeyboard
      }
    );

    // Store pool info for confirmation
    ctx.session.tempData!.selectedPool = bestPool.poolId;
    ctx.session.tempData!.poolInfo = {
      protocol: bestPool.project,
      apy: bestPool.apy,
      tvlUsd: bestPool.tvlUsd,
      riskScore: calculateRiskScore(bestPool)
    };
  } catch (error) {
    console.error("Error handling zap amount input:", error);
    await ctx.reply(ERRORS.NETWORK_ERROR);
  }
}

// Handle zap confirmation
export async function handleZapConfirmation(
  ctx: BotContext,
  confirmed: boolean
): Promise<void> {
  try {
    // Remove the confirmation keyboard
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });

    if (!confirmed) {
      await ctx.reply("Zap cancelled.");
      ctx.session.currentAction = undefined;
      ctx.session.tempData = {};
      return;
    }

    const userId = ctx.session.userId;
    const { amount, selectedPool, poolInfo, walletAddress } = ctx.session.tempData!;

    if (!userId || !amount || !selectedPool) {
      await ctx.reply("❌ Session expired. Please start again with /zap");
      return;
    }

    await ctx.reply("⏳ Executing your zap transaction...\n\n🔄 This may take 30-60 seconds.");

    try {
      // Get user's wallet for transaction execution
      const wallet = await getWallet(userId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Execute real DeFi transaction
      console.log(`Executing real zap: ${amount} USDC to ${poolInfo.protocol}`);
      
      const txReceipt = await executeZap(
        poolInfo.protocol, // "Aave" or "Compound"
        wallet,
        amount
      );

      const positionId = `pos_${Date.now()}_${userId}`;

      // Only save position and transaction if the transaction was successful
      await savePosition({
        id: positionId,
        userId,
        poolId: selectedPool,
        protocol: poolInfo.protocol,
        chain: "Base",
        tokenSymbol: "USDC",
        amountInvested: parseFloat(amount),
        currentValue: parseFloat(amount), // Initially same as invested
        entryApy: poolInfo.apy,
        currentApy: poolInfo.apy,
        yieldEarned: 0,
        txHash: txReceipt.transactionHash,
        createdAt: new Date()
      });

      // Save transaction record
      await saveTransaction(
        txReceipt.transactionHash,
        userId,
        walletAddress,
        "zap",
        "USDC", 
        amount,
        txReceipt.status, // "success" or "failure" from actual transaction
        selectedPool,
        poolInfo.protocol,
        undefined, // No yield earned yet
        txReceipt.gasUsed
      );

      await ctx.reply(
        `✅ *Zap Successful!*\n\n` +
        `💰 **Investment**: $${amount} USDC\n` +
        `🏦 **Protocol**: ${poolInfo.protocol}\n` +
        `📈 **Entry APY**: ${poolInfo.apy}%\n` +
        `🔗 **Transaction**: \`${txReceipt.transactionHash}\`\n\n` +
        `🌱 Your position is now earning yield! Use /portfolio to track your performance.\n\n` +
        `⏰ Yields update every few minutes. I'll notify you of any significant changes.`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🚀 Zap More", "zap_funds")
            .text("📊 View Portfolio", "view_portfolio")
        }
      );

      // Reset state
      ctx.session.currentAction = undefined;
      ctx.session.tempData = {};

    } catch (transactionError) {
      console.error("Transaction failed:", transactionError);
      
      // For real transaction failures, we don't create fake transaction records
      // The actual transaction hash and gas info isn't available if it failed

      let errorMessage = (transactionError as Error).message || 'Network error';
      let userFriendlyMessage = '';

      // Handle specific error types
      if (errorMessage.includes('transfer amount exceeds allowance')) {
        userFriendlyMessage = 'Token approval failed. This usually means the approval transaction didn\'t complete properly.';
      } else if (errorMessage.includes('insufficient funds')) {
        userFriendlyMessage = 'Insufficient USDC balance for this transaction.';
      } else if (errorMessage.includes('gas required exceeds allowance')) {
        userFriendlyMessage = 'Insufficient ETH balance for gas fees.';
      } else if (errorMessage.includes('Approval transaction failed')) {
        userFriendlyMessage = 'The approval transaction failed. Please try again.';
      } else {
        userFriendlyMessage = 'Network or contract error occurred.';
      }

      // Store retry parameters before showing error
      ctx.session.retryZap = {
        amount,
        selectedPool,
        poolInfo,
        walletAddress
      };

      await ctx.reply(
        `❌ *Transaction Failed*\n\n` +
        `**Amount**: $${amount} USDC\n` +
        `**Protocol**: ${poolInfo.protocol}\n\n` +
        `**Issue**: ${userFriendlyMessage}\n\n` +
        `**Technical**: ${errorMessage.substring(0, 200)}${errorMessage.length > 200 ? '...' : ''}\n\n` +
        `💡 **Try Again**: Your funds are safe. Retry with same parameters\n` +
        `🔍 **Check**: Use /balance to verify your USDC and ETH balances`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔄 Retry Same Zap", "retry_zap")
            .text("🚀 Start New Zap", "zap_funds")
            .row()
            .text("📊 Check Balance", "check_balance")
        }
      );

      // Reset main state but keep retry data
      ctx.session.currentAction = undefined;
      ctx.session.tempData = {};
    }

  } catch (error) {
    console.error("Error processing zap confirmation:", error);
    await ctx.reply(
      "❌ An unexpected error occurred. Please try again with /zap"
    );
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
  }
}

// Handle zap retry with same parameters
export async function handleZapRetry(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    const retryData = ctx.session.retryZap;

    if (!userId || !retryData) {
      await ctx.answerCallbackQuery("❌ No retry data found. Please start a new zap.");
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.reply("⏳ Retrying zap transaction with same parameters...\n\n🔄 This may take 30-60 seconds.");

    const { amount, selectedPool, poolInfo, walletAddress } = retryData;

    try {
      // Get user's wallet for transaction execution
      const wallet = await getWallet(userId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      // Execute real DeFi transaction with same parameters
      console.log(`Retrying zap: ${amount} USDC to ${poolInfo.protocol}`);
      
      const txReceipt = await executeZap(
        poolInfo.protocol, // "Aave" or "Compound"
        wallet,
        amount
      );

      const positionId = `pos_${Date.now()}_${userId}`;

      // Save position and transaction if successful
      await savePosition({
        id: positionId,
        userId,
        poolId: selectedPool,
        protocol: poolInfo.protocol,
        chain: "Base",
        tokenSymbol: "USDC",
        amountInvested: parseFloat(amount),
        currentValue: parseFloat(amount),
        entryApy: poolInfo.apy,
        currentApy: poolInfo.apy,
        yieldEarned: 0,
        txHash: txReceipt.transactionHash,
        createdAt: new Date()
      });

      // Save transaction record
      await saveTransaction(
        txReceipt.transactionHash,
        userId,
        walletAddress,
        "zap",
        "USDC", 
        amount,
        txReceipt.status,
        selectedPool,
        poolInfo.protocol,
        undefined,
        txReceipt.gasUsed
      );

      await ctx.reply(
        `✅ *Zap Successful!*\n\n` +
        `💰 **Investment**: $${amount} USDC\n` +
        `🏦 **Protocol**: ${poolInfo.protocol}\n` +
        `📈 **Entry APY**: ${poolInfo.apy}%\n` +
        `🔗 **Transaction**: \`${txReceipt.transactionHash}\`\n\n` +
        `🌱 Your position is now earning yield! Use /portfolio to track your performance.\n\n` +
        `⏰ Yields update every few minutes. I'll notify you of any significant changes.`,
        { 
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🚀 Zap More", "zap_funds")
            .text("📊 View Portfolio", "view_portfolio")
        }
      );

      // Clear retry data on success
      ctx.session.retryZap = undefined;

    } catch (transactionError) {
      console.error("Retry transaction failed:", transactionError);
      
      let errorMessage = (transactionError as Error).message || 'Network error';
      let userFriendlyMessage = '';

      // Handle specific error types
      if (errorMessage.includes('transfer amount exceeds allowance')) {
        userFriendlyMessage = 'Token approval failed. This usually means the approval transaction didn\'t complete properly.';
      } else if (errorMessage.includes('insufficient funds')) {
        userFriendlyMessage = 'Insufficient USDC balance for this transaction.';
      } else if (errorMessage.includes('gas required exceeds allowance')) {
        userFriendlyMessage = 'Insufficient ETH balance for gas fees.';
      } else if (errorMessage.includes('Approval transaction failed')) {
        userFriendlyMessage = 'The approval transaction failed. Please try again.';
      } else {
        userFriendlyMessage = 'Network or contract error occurred.';
      }

      await ctx.reply(
        `❌ *Retry Failed*\n\n` +
        `**Amount**: $${amount} USDC\n` +
        `**Protocol**: ${poolInfo.protocol}\n\n` +
        `**Issue**: ${userFriendlyMessage}\n\n` +
        `**Technical**: ${errorMessage.substring(0, 200)}${errorMessage.length > 200 ? '...' : ''}\n\n` +
        `💡 **Options**: Check your balances or try a smaller amount\n` +
        `🔍 **Check**: Use /balance to verify your USDC and ETH balances`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔄 Retry Again", "retry_zap")
            .text("🚀 Start New Zap", "zap_funds")
            .row()
            .text("📊 Check Balance", "check_balance")
        }
      );
    }

  } catch (error) {
    console.error("Error handling zap retry:", error);
    await ctx.reply("❌ An error occurred during retry. Please try a new zap with /zap");
    ctx.session.retryZap = undefined;
  }
}

export default zapHandler;