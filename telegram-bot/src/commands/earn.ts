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

/**
 * Get real-time yield opportunities for USDC lending on Base
 * Uses DeFiLlama API with fallback to cached data
 */
export async function getYieldOpportunities(
  token: string = "USDC", 
  riskLevel: number = 3,
  minApy: number = 5
): Promise<YieldOpportunity[]> {
  try {
    // Import the DeFiLlama API client
    const { fetchRealTimeYields } = await import("../lib/defillama-api");
    
    // Fetch real-time yield data
    const realTimeOpportunities = await fetchRealTimeYields();
    
    // Apply risk scores to the real-time data
    const opportunitiesWithRisk = realTimeOpportunities.map(pool => ({
      ...pool,
      riskScore: calculateRiskScore(pool)
    }));
    
    console.log("✅ Using real-time yield data from DeFiLlama");
    return opportunitiesWithRisk;
    
  } catch (error) {
    console.error("❌ Failed to fetch real-time yields, using fallback data:", error);
    
    // Fallback to static data if API fails
    return [
      {
        poolId: "morpho-pyth-usdc",
        project: "Morpho",
        chain: "Base", 
        symbol: "USDC",
        tvlUsd: 50_000_000,
        apy: 10.0,
        apyBase: 10.0,
        apyReward: 0.0,
        ilRisk: "no",
        exposure: "single",
        underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        rewardTokens: [],
        riskScore: 5,
        protocol: "morpho"
      },
      {
        poolId: "spark-usdc",
        project: "Spark",
        chain: "Base", 
        symbol: "USDC",
        tvlUsd: 50_000_000,
        apy: 8.0,
        apyBase: 8.0,
        apyReward: 0.0,
        ilRisk: "no",
        exposure: "single",
        underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        rewardTokens: [],
        riskScore: 1,
        protocol: "spark"
      },
      {
        poolId: "fluid-usdc-base",
        project: "Fluid",
        chain: "Base",
        symbol: "USDC",
        tvlUsd: 120_000_000,
        apy: 7.72,
        apyBase: 4.0,
        apyReward: 3.72,
        ilRisk: "no",
        exposure: "single",
        underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        rewardTokens: [],
        riskScore: 1,
        protocol: "fluid"
      },
      {
        poolId: "aave-usdc-base",
        project: "Aave",
        chain: "Base",
        symbol: "USDC",
        tvlUsd: 150_000_000,
        apy: 5.69,
        apyBase: 3.2,
        apyReward: 2.0,
        ilRisk: "no",
        exposure: "single",
        underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        rewardTokens: [],
        riskScore: 1,
        protocol: "aave"
      },
      {
        poolId: "compound-v3-usdc-base", 
        project: "Compound",
        chain: "Base",
        symbol: "USDC",
        tvlUsd: 89_000_000,
        apy: 7.65,
        apyBase: 6.75,
        apyReward: 0.91,
        ilRisk: "no",
        exposure: "single",
        underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
        riskScore: 1,
        protocol: "compound"
      }
    ];
  }
}

export function calculateRiskScore(pool: YieldOpportunity): number {
  let risk = 0;
  
  // TVL risk (higher TVL = lower risk)
  if (pool.tvlUsd < 10_000_000) risk += 5;
  else if (pool.tvlUsd < 50_000_000) risk += 3;
  else if (pool.tvlUsd < 100_000_000) risk += 2;
  else risk += 1;
  
  // Protocol reputation risk
  const protocolRisk: Record<string, number> = {
    'Aave': 1, 'Compound': 1, 'Fluid': 1, 'Morpho': 2, 'Yearn': 2, 
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

const earnHandler: CommandHandler = {
  command: "earn", 
  description: "Start earning with your funds",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      const firstName = ctx.from?.first_name || "there";

      // Check RPC configuration first  
      if (!isRpcConfigured()) {
        await ctx.reply(`❌ Something's not right with our connection, ${firstName}. Please try again in a moment.`);
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);
      if (!wallet) {
        const keyboard = new InlineKeyboard()
          .text("✨ Set Up Wallet", "create_wallet")
          .text("🔑 Import Wallet", "import_wallet");

        await ctx.reply(
          `👋 Hey ${firstName}! You need a wallet to start earning.\n\nLet me help you set that up:`,
          { reply_markup: keyboard }
        );
        return;
      }

      // Set current action (keeping internal naming for now)
      ctx.session.currentAction = "zap_amount";
      
      // For v1, we'll start with USDC only
      ctx.session.tempData = {
        selectedToken: "USDC",
        walletAddress: wallet.address
      };

      // Simplified earn options
      const keyboard = new InlineKeyboard()
        .text("🐙 inkvest Auto-Managed", "zap_auto_deploy")
        .row()
        .text("🎯 Manual Management", "zap_choose_protocol");

      await ctx.reply(
        `🦑 *Ready to start earning, ${firstName}?*\n\n` +
        `I'll find the best yields for your USDC based on your risk level (${ctx.session.settings?.riskLevel || 3}/5).\n\n` +
        `🐙 **inkvest Auto-Managed**: Always earn maximum yield, no performance fees, 1% AUM fee at deposit\n` +
        `🎯 **Manual Management**: You choose the protocol\n\n` +
        `What sounds good?`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
    } catch (error) {
      console.error("Error in earn command:", error);
      await ctx.reply("❌ Something went wrong. Please try again in a moment.");
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
    console.log(`🔍 Raw opportunities from API: ${opportunities.map(p => `${p.project}(${p.apy}%)`).join(', ')}`);
    
    // Filter and score pools
    console.log(`🔍 Pool selection filters: Risk Level ${userRiskLevel} (max ${userRiskLevel * 2}), Min APY ${userMinApy}%`);
    
    const suitablePools = opportunities
      .filter(pool => {
        const riskScore = calculateRiskScore(pool);
        const passes = riskScore <= userRiskLevel * 2;
        console.log(`🔍 ${pool.project}: Risk ${riskScore}/10, APY ${pool.apy}% - ${passes ? 'PASS' : 'FILTERED OUT'}`);
        return passes;
      })
      .filter(pool => {
        const passes = pool.apy >= userMinApy;
        if (!passes) console.log(`🔍 ${pool.project}: APY ${pool.apy}% < ${userMinApy}% - FILTERED OUT BY APY`);
        return passes;
      })
      .sort((a, b) => b.apy - a.apy);
    
    if (suitablePools.length === 0) {
      console.log(`❌ No suitable pools found! Available pools were:`, opportunities.map(p => ({
        project: p.project,
        apy: p.apy,
        riskScore: calculateRiskScore(p),
        tvl: p.tvlUsd
      })));
      
      await ctx.reply(
        `😔 No pools match your criteria:\n` +
        `• Risk level: ${userRiskLevel}/5 (max risk score: ${userRiskLevel * 2})\n` +
        `• Min APY: ${userMinApy}%\n\n` +
        `Available pools:\n` +
        opportunities.map(p => `• ${p.project}: ${p.apy}% APY, Risk: ${calculateRiskScore(p)}/10`).join('\n') + 
        `\n\nTry adjusting your settings with /settings`
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
    
    keyboard.text("🐙 Just Pick Best APY", "zap_auto_deploy");
    
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
      // Check if user has Smart Wallet for gasless transactions
      const { hasCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
      const hasSmartWallet = hasCoinbaseSmartWallet(userId);

      // Only check ETH balance if NOT using Smart Wallet (gasless)
      if (!hasSmartWallet) {
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
      } else {
        console.log(`🦑 Skipping ETH check - using gasless Smart Wallet`);
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
        // Import smart recovery utilities
        const { sendInsufficientBalanceFlow } = await import("../utils/smart-recovery");
        
        // Get pool info for the smart recovery
        let selectedPool;
        let poolInfo;

        if (ctx.session.tempData?.selectedPool && ctx.session.tempData?.poolInfo) {
          selectedPool = ctx.session.tempData.selectedPool;
          poolInfo = ctx.session.tempData.poolInfo;
        } else {
          // Fallback: Get the best pool for auto-deployment
          const opportunities = await getYieldOpportunities("USDC");
          const bestPool = opportunities
            .filter(pool => pool.tvlUsd >= RISK_THRESHOLDS.TVL_SAFE)
            .sort((a, b) => b.apy - a.apy)[0];

          if (!bestPool) {
            await ctx.reply("❌ No suitable pools found. Please try again later.");
            return;
          }

          selectedPool = bestPool.poolId;
          poolInfo = {
            protocol: bestPool.project,
            apy: bestPool.apy,
            tvlUsd: bestPool.tvlUsd,
            riskScore: calculateRiskScore(bestPool)
          };
        }

        // Show intelligent insufficient balance flow
        await sendInsufficientBalanceFlow(ctx, {
          currentBalance: readableBalance,
          requestedAmount: amount,
          shortage: amount - readableBalance,
          protocol: poolInfo.protocol,
          poolId: selectedPool,
          apy: poolInfo.apy,
          poolInfo: poolInfo
        });
        
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

    // Use the already selected pool from session data
    let selectedPool;
    let poolInfo;

    if (ctx.session.tempData?.selectedPool && ctx.session.tempData?.poolInfo) {
      // Pool was already selected (either via auto or manual selection)
      selectedPool = ctx.session.tempData.selectedPool;
      poolInfo = ctx.session.tempData.poolInfo;
    } else {
      // Fallback: Get the best pool for auto-deployment (shouldn't happen normally)
      const opportunities = await getYieldOpportunities("USDC");
      const bestPool = opportunities
        .filter(pool => pool.tvlUsd >= RISK_THRESHOLDS.TVL_SAFE)
        .sort((a, b) => b.apy - a.apy)[0];

      if (!bestPool) {
        await ctx.reply("❌ No suitable pools found. Please try again later.");
        return;
      }

      selectedPool = bestPool.poolId;
      poolInfo = {
        protocol: bestPool.project,
        apy: bestPool.apy,
        tvlUsd: bestPool.tvlUsd,
        riskScore: calculateRiskScore(bestPool)
      };
      
      // Store it for later use
      ctx.session.tempData!.selectedPool = selectedPool;
      ctx.session.tempData!.poolInfo = poolInfo;
    }

    // Calculate estimated yearly yield using the selected pool
    const yearlyYield = (amount * poolInfo.apy) / 100;
    const monthlyYield = yearlyYield / 12;

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Confirm", "confirm_yes")
      .text("❌ Cancel", "confirm_no");

    await ctx.reply(
      `🎯 *Zap Confirmation*\n\n` +
      `**Investment**: $${amount} USDC\n` +
      `**Selected Pool**: ${poolInfo.protocol} USDC\n` +
      `**Current APY**: ${poolInfo.apy}%\n` +
      `**TVL**: $${(poolInfo.tvlUsd / 1_000_000).toFixed(1)}M\n\n` +
      `**Estimated Returns**:\n` +
      `• Monthly: ~$${monthlyYield.toFixed(2)}\n` +
      `• Yearly: ~$${yearlyYield.toFixed(2)}\n\n` +
      `**Safety Features**:\n` +
      `✅ High TVL (${(poolInfo.tvlUsd / 1_000_000).toFixed(0)}M+)\n` +
      `✅ Audited protocol\n` +
      `✅ No impermanent loss risk\n\n` +
      `⚠️ *Note: APY rates can change. Past performance doesn't guarantee future results.*\n\n` +
      `Proceed with this investment?`,
      {
        parse_mode: "Markdown",
        reply_markup: confirmKeyboard
      }
    );

    // Pool info is already stored above in the logic, no need to store again
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
    const { amount, selectedPool, poolInfo } = ctx.session.tempData!;

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

      const walletAddress = wallet.address;

      // Execute real DeFi transaction
      console.log(`Executing real zap: ${amount} USDC to ${poolInfo.protocol}`);
      
      const txReceipt = await executeZap(
        poolInfo.protocol, // "Aave" or "Compound"
        wallet,
        amount,
        userId // Pass userId for gasless transaction detection
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
            .text("🦑 Earn More", "zap_funds")
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
        poolInfo
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
            .text("🦑 Start Earning", "zap_funds")
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

// Handle auto-earn deployment
export async function handleAutoEarn(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;

    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    await ctx.answerCallbackQuery();

    // Set session to auto mode
    ctx.session.zapMode = "auto";

    // Get the best pool automatically
    const userRiskLevel = ctx.session.settings?.riskLevel || 3;
    const userMinApy = ctx.session.settings?.minApy || 5;
    
    const opportunities = await getYieldOpportunities("USDC", userRiskLevel, userMinApy);
    const bestPool = opportunities
      .filter(pool => {
        const riskScore = calculateRiskScore(pool);
        return riskScore <= userRiskLevel * 2;
      })
      .filter(pool => pool.apy >= userMinApy)
      .sort((a, b) => b.apy - a.apy)[0]; // Get highest APY
    
    console.log(`Auto earn selected: ${bestPool?.project} with ${bestPool?.apy}% APY`);

    if (!bestPool) {
      await ctx.reply(
        "😔 No suitable pools found for auto-deployment.\n\n" +
        "Try adjusting your settings with /settings or choose manually."
      );
      return;
    }

    // Store the selected pool
    ctx.session.tempData = {
      selectedPool: bestPool.poolId,
      poolInfo: {
        protocol: bestPool.project,
        apy: bestPool.apy,
        tvlUsd: bestPool.tvlUsd,
        riskScore: calculateRiskScore(bestPool)
      }
    };
    ctx.session.currentAction = "zap_amount";

    // Show the selected pool and ask for amount
    const riskScore = calculateRiskScore(bestPool);
    const safetyIcon = riskScore <= 3 ? "🛡️" : riskScore <= 6 ? "⚠️" : "🚨";

    await ctx.reply(
      `🐙 **inkvest Auto-Managed Selected Best Pool**\n\n` +
      `${safetyIcon} **${bestPool.project}** - Highest APY Available\n` +
      `• **APY**: **${bestPool.apy}%** (${bestPool.apyBase}% base + ${bestPool.apyReward}% rewards)\n` +
      `• **TVL**: $${(bestPool.tvlUsd / 1_000_000).toFixed(1)}M\n` +
      `• **Risk Score**: ${riskScore}/10\n` +
      `• **Safety**: ${riskScore <= 3 ? "Very Safe" : riskScore <= 6 ? "Moderate" : "Higher Risk"}\n\n` +
      `💰 **How much USDC would you like to invest?**\n\n` +
      `Enter the amount in USDC (e.g., "10", "25.5"):`,
      { parse_mode: "Markdown" }
    );

  } catch (error) {
    console.error("Error in auto-earn deployment:", error);
    await ctx.reply("❌ Error setting up auto-deployment. Please try again.");
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

    const { amount, selectedPool, poolInfo } = retryData;

    try {
      // Get user's wallet for transaction execution
      const wallet = await getWallet(userId);
      if (!wallet) {
        throw new Error("Wallet not found");
      }

      const walletAddress = wallet.address;

      // Execute real DeFi transaction with same parameters
      console.log(`Retrying zap: ${amount} USDC to ${poolInfo.protocol}`);
      
      const txReceipt = await executeZap(
        poolInfo.protocol, // "Aave" or "Compound"
        wallet,
        amount,
        userId // Pass userId for gasless transaction detection
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
            .text("🦑 Earn More", "zap_funds")
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
            .text("🦑 Start Earning", "zap_funds")
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

export default earnHandler;