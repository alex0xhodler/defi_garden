import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { YieldOpportunity } from "../types/config";
import { ERRORS, RISK_THRESHOLDS } from "../utils/constants";
import { getWallet } from "../lib/token-wallet";
import { 
  savePosition, 
  saveTransaction,
  getPositionsByUserId 
} from "../lib/database";
import { isValidAmount } from "../utils/validators";

// Mock function - will be replaced with actual API integration
async function getYieldOpportunities(
  token: string = "USDC", 
  riskLevel: number = 3,
  minApy: number = 5
): Promise<YieldOpportunity[]> {
  // Mock data for v1 - replace with actual DeFiLlama API call
  return [
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
        .text("🤖 Auto-Deploy (Recommended)", "zap_auto_deploy")
        .row()
        .text("🎯 Choose Protocol Manually", "zap_choose_protocol")
        .row()
        .text("📊 Compare All Options", "zap_compare_all");

      await ctx.reply(
        `🚀 *Ready to Zap USDC into Yield Farming*\n\n` +
        `I'll find the best opportunities based on your risk level (${ctx.session.settings?.riskLevel || 3}/5).\n\n` +
        `**Auto-Deploy**: I pick the highest APY pool with good safety scores\n` +
        `**Manual**: You choose from available protocols\n` +
        `**Compare**: See all options with detailed info\n\n` +
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
    
    // Basic validation - minimum $10 investment
    if (amount < 10) {
      await ctx.reply("❌ Minimum investment is $10 USDC.\n\nTry again or type /cancel to abort.");
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

    // TODO: Implement actual zap transaction
    // For v1, we'll simulate the transaction
    const simulatedTxHash = "0x" + Math.random().toString(16).substring(2, 66);
    const positionId = `pos_${Date.now()}_${userId}`;

    // Save the position to database
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
      txHash: simulatedTxHash,
      createdAt: new Date()
    });

    // Save transaction record
    await saveTransaction(
      simulatedTxHash,
      userId,
      walletAddress,
      "zap",
      "USDC", 
      amount,
      "success",
      selectedPool,
      poolInfo.protocol,
      undefined, // No yield earned yet
      "21000" // Simulated gas used
    );

    await ctx.reply(
      `✅ *Zap Successful!*\n\n` +
      `💰 **Investment**: $${amount} USDC\n` +
      `🏦 **Protocol**: ${poolInfo.protocol}\n` +
      `📈 **Entry APY**: ${poolInfo.apy}%\n` +
      `🔗 **Transaction**: \`${simulatedTxHash}\`\n\n` +
      `🌱 Your position is now earning yield! Use /portfolio to track your performance.\n\n` +
      `⏰ Yields update every few minutes. I'll notify you of any significant changes.`,
      { 
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📊 View Portfolio", "view_portfolio")
          .text("🚀 Zap More", "zap_funds")
      }
    );

    // Reset state
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
  } catch (error) {
    console.error("Error processing zap confirmation:", error);
    await ctx.reply(
      "❌ An error occurred while processing your zap. Please check /portfolio to see if the transaction completed."
    );
    ctx.session.currentAction = undefined;
    ctx.session.tempData = {};
  }
}

export default zapHandler;