import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { ERRORS } from "../utils/constants";
import { 
  getPositionsByUserId, 
  getPortfolioStats 
} from "../lib/database";
import { getWallet, getAaveBalance, getFluidBalance, getCompoundBalance, getTokenBalance } from "../lib/token-wallet";
import { Address } from "viem";
import { BASE_TOKENS } from "../utils/constants";
import { riskIcon } from "../utils/risk-icons";

const portfolioHandler: CommandHandler = {
  command: "portfolio",
  description: "View DeFi positions and yields", 
  handler: async (ctx: BotContext) => {
    console.log("🔍 Portfolio command executed - DEBUG VERSION LOADED");
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get user's wallet
      const wallet = await getWallet(userId);
      if (!wallet) {
        await ctx.reply("❌ No wallet found. Create one first with /start");
        return;
      }

      // Check if user has Smart Wallet and use appropriate address for balance checks
      const { hasCoinbaseSmartWallet, getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
      let walletAddress = wallet.address as Address;
      let usingSmartWallet = false;
      let smartWallet: any = null;
      
      if (hasCoinbaseSmartWallet(userId)) {
        smartWallet = await getCoinbaseSmartWallet(userId);
        if (smartWallet) {
          walletAddress = smartWallet.smartAccount.address;
          usingSmartWallet = true;
          console.log(`📍 Using Smart Wallet address for portfolio: ${walletAddress}`);
        }
      }

      // Add small delay to ensure blockchain state consistency after recent transactions
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch real on-chain balances
      const { getMorphoBalance } = await import("../services/morpho-defi");
      const { getSparkBalance } = await import("../services/spark-defi");
      const { getSeamlessBalance } = await import("../services/seamless-defi");
      const { getMoonwellBalance } = await import("../services/moonwell-defi");
      const { getMorphoRe7Balance } = await import("../services/morpho-re7-defi");
      const [aaveBalance, fluidBalance, compoundBalance, morphoBalance, sparkBalance, seamlessBalance, moonwellBalance, morphoRe7Balance, usdcBalance] = await Promise.all([
        getAaveBalance(walletAddress),
        getFluidBalance(walletAddress),
        getCompoundBalance(walletAddress),
        getMorphoBalance(wallet.address as Address).catch(error => {
          console.error(`❌ Portfolio command - Morpho balance fetch failed for ${wallet.address}:`, error);
          return { assetsFormatted: '0.00' };
        }), // Use regular wallet address like start-help.ts
        smartWallet?.smartAccount?.address ? getSparkBalance(smartWallet.smartAccount.address).catch(error => {
          console.error(`❌ Portfolio command - Spark balance fetch failed for ${smartWallet?.smartAccount?.address}:`, error);
          return { assetsFormatted: '0.00' };
        }) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWallet?.smartAccount?.address ? getSeamlessBalance(smartWallet.smartAccount.address).catch(error => {
          console.error(`❌ Portfolio command - Seamless balance fetch failed for ${smartWallet?.smartAccount?.address}:`, error);
          return { assetsFormatted: '0.00' };
        }) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWallet?.smartAccount?.address ? getMoonwellBalance(smartWallet.smartAccount.address).catch(error => {
          console.error(`❌ Portfolio command - Moonwell balance fetch failed for ${smartWallet?.smartAccount?.address}:`, error);
          return { assetsFormatted: '0.00' };
        }) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWallet?.smartAccount?.address ? getMorphoRe7Balance(smartWallet.smartAccount.address).catch(error => {
          console.error(`❌ Portfolio command - Morpho Re7 balance fetch failed for ${smartWallet?.smartAccount?.address}:`, error);
          return { assetsFormatted: '0.00' };
        }) : Promise.resolve({ assetsFormatted: '0.00' }),
        getTokenBalance(BASE_TOKENS.USDC, walletAddress)
      ]);

      const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
      const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
      const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
      const morphoBalanceNum = parseFloat(morphoBalance.assetsFormatted);
      const sparkBalanceNum = parseFloat(sparkBalance.assetsFormatted);
      const seamlessBalanceNum = parseFloat(seamlessBalance.assetsFormatted);
      const moonwellBalanceNum = parseFloat(moonwellBalance.assetsFormatted);
      const morphoRe7BalanceNum = parseFloat(morphoRe7Balance.assetsFormatted);
      const usdcBalanceNum = parseFloat(usdcBalance) / 1e6; // Convert from wei to USDC
      
      console.log(`🔍 Portfolio command - Morpho balance: ${morphoBalance.assetsFormatted} → ${morphoBalanceNum}`);
      console.log(`🔍 Portfolio command - Spark balance: ${sparkBalance.assetsFormatted} → ${sparkBalanceNum}`);
      console.log(`🔍 Portfolio command - Seamless balance: ${seamlessBalance.assetsFormatted} → ${seamlessBalanceNum}`);
      console.log(`🔍 Portfolio command - Moonwell balance: ${moonwellBalance.assetsFormatted} → ${moonwellBalanceNum}`);
      console.log(`🔍 Portfolio command - Morpho Re7 balance: ${morphoRe7Balance.assetsFormatted} → ${morphoRe7BalanceNum}`);

      // If no DeFi deposits, show empty portfolio
      if (aaveBalanceNum === 0 && fluidBalanceNum === 0 && compoundBalanceNum === 0 && morphoBalanceNum === 0 && sparkBalanceNum === 0 && seamlessBalanceNum === 0 && moonwellBalanceNum === 0 && morphoRe7BalanceNum === 0) {
        const keyboard = new InlineKeyboard()
          .text("🦑 Start Earning", "zap_funds")
          .text("📥 Deposit", "deposit")
          .row()
          .text("💰 Check Balance", "check_balance")
          .text("📚 Learn More", "help");

        await ctx.reply(
          `📊 **Your DeFi Portfolio**\n\n` +
          `🌱 You haven't started yield farming yet!\n\n` +
          `**Current Balances**:\n` +
          `• Wallet USDC: $${usdcBalanceNum.toFixed(2)}\n` +
          `• Aave Deposits: $0.00\n` +
          `• Fluid Deposits: $0.00\n` +
          `• Compound Deposits: $0.00\n\n` +
          `**Get Started**:\n` +
          `• Use 🦑 Start Earning to auto-deploy to best yields\n` +
          `• Earn 5%+ APY on your USDC\n` +
          `• Only vetted, high-TVL protocols\n\n` +
          `💡 **Tip**: Portfolio now shows real-time blockchain data`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard
          }
        );
        return;
      }

      // Fetch real-time APY data (with current fallbacks)
      let aaveApy = 5.69;
      let fluidApy = 7.72;
      let compoundApy = 7.65;
      let morphoApy = 10.0;
      let sparkApy = 8.0;
      let seamlessApy = 5.0;
      let moonwellApy = 5.0;
      let morphoRe7Apy = 6.0;
      
      try {
        const { fetchProtocolApy } = await import("../lib/defillama-api");
        const [realAaveApy, realFluidApy, realCompoundApy, realMorphoApy, realSparkApy, realSeamlessApy, realMoonwellApy, realMorphoRe7Apy] = await Promise.allSettled([
          fetchProtocolApy("AAVE"),
          fetchProtocolApy("FLUID"), 
          fetchProtocolApy("COMPOUND"),
          fetchProtocolApy("MORPHO"),
          fetchProtocolApy("SPARK"),
          fetchProtocolApy("SEAMLESS"),
          fetchProtocolApy("MOONWELL"),
          fetchProtocolApy("MORPHO_RE7")
        ]);
        
        if (realAaveApy.status === 'fulfilled') aaveApy = realAaveApy.value;
        if (realFluidApy.status === 'fulfilled') fluidApy = realFluidApy.value;
        if (realCompoundApy.status === 'fulfilled') compoundApy = realCompoundApy.value;
        if (realMorphoApy.status === 'fulfilled') morphoApy = realMorphoApy.value;
        if (realSparkApy.status === 'fulfilled') sparkApy = realSparkApy.value;
        if (realSeamlessApy.status === 'fulfilled') seamlessApy = realSeamlessApy.value;
        if (realMoonwellApy.status === 'fulfilled') moonwellApy = realMoonwellApy.value;
        if (realMorphoRe7Apy.status === 'fulfilled') morphoRe7Apy = realMorphoRe7Apy.value;
        
        console.log(`Portfolio APY rates: Aave ${aaveApy}%, Fluid ${fluidApy}%, Compound ${compoundApy}%, Morpho ${morphoApy}%, Spark ${sparkApy}%, Seamless ${seamlessApy}%, Moonwell ${moonwellApy}%, Morpho Re7 ${morphoRe7Apy}%`);
      } catch (error) {
        console.warn("Failed to fetch real-time APY, using fallback rates:", error);
      }
      const totalValue = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + sparkBalanceNum + seamlessBalanceNum + moonwellBalanceNum + morphoRe7BalanceNum;
      
      // Calculate total monthly earnings projection
      const positions = [];
      if (morphoBalanceNum > 0) positions.push({ balance: morphoBalanceNum, apy: morphoApy, name: 'Morpho PYTH/USDC' });
      if (morphoRe7BalanceNum > 0) positions.push({ balance: morphoRe7BalanceNum, apy: morphoRe7Apy, name: 'Re7 Universal USDC' });
      if (sparkBalanceNum > 0) positions.push({ balance: sparkBalanceNum, apy: sparkApy, name: 'Spark USDC' });
      if (seamlessBalanceNum > 0) positions.push({ balance: seamlessBalanceNum, apy: seamlessApy, name: 'Seamless USDC' });
      if (moonwellBalanceNum > 0) positions.push({ balance: moonwellBalanceNum, apy: moonwellApy, name: 'Moonwell USDC' });
      if (compoundBalanceNum > 0) positions.push({ balance: compoundBalanceNum, apy: compoundApy, name: 'Compound V3' });
      if (fluidBalanceNum > 0) positions.push({ balance: fluidBalanceNum, apy: fluidApy, name: 'Fluid Finance' });
      if (aaveBalanceNum > 0) positions.push({ balance: aaveBalanceNum, apy: aaveApy, name: 'Aave V3' });
      
      // Sort by balance (highest first) for cleaner display
      positions.sort((a, b) => b.balance - a.balance);
      
      const monthlyEarnings = positions.reduce((total, pos) => total + (pos.balance * pos.apy / 100) / 12, 0);
      
      let message = `💰 **Your Investments**\n\n`;
      
      // Combined investment overview in flowing format
      for (const position of positions) {
        const monthlyFromThis = (position.balance * position.apy / 100) / 12;
        const yearlyFromThis = position.balance * position.apy / 100;
        const dailyFromThis = yearlyFromThis / 365;
        
        if (monthlyEarnings >= 0.01) {
          message += `You've invested **$${position.balance.toFixed(2)}** in ${position.name} at ${position.apy.toFixed(1)}% APY,\nearning **~$${monthlyFromThis.toFixed(2)}** monthly with auto-compounding!\n\n`;
        } else if (dailyFromThis >= 0.001) {
          message += `You've invested **$${position.balance.toFixed(2)}** in ${position.name} at ${position.apy.toFixed(1)}% APY,\nearning **~$${dailyFromThis.toFixed(3)}** daily with auto-compounding!\n\n`;
        } else {
          message += `You've invested **$${position.balance.toFixed(2)}** in ${position.name} at ${position.apy.toFixed(1)}% APY,\nearning **~$${yearlyFromThis.toFixed(2)}** yearly with auto-compounding!\n\n`;
        }
      }

      // Deposit section with encouraging and actionable messaging
      if (usdcBalanceNum >= 1.0) {
        message += `🦑 **Ready to grow your earnings?**\n`;
        message += `You have $${usdcBalanceNum.toFixed(2)} USDC ready to invest. Your money will start earning immediately with zero fees and auto-compounding!\n\n`;
      } else {
        message += `Add more USDC and watch your daily earnings\ncompound automatically. No fees, no lock-ups,\nwithdraw anytime with no transaction fees.\n\n`;
      }
      // Always show deposit address since users need it to add more funds
      message += `Send USDC to your address:\n\`${wallet.address}\`\n*Network: Base \u2022 Minimum: $1 USDC*\n\n`;

      // Quick actions - prioritized layout with single-button rows for main actions
      const keyboard = new InlineKeyboard()
        .text("🦑 Earn More", "zap_funds")
        .row()
        .text("💰 Collect Earnings", "harvest_yields")
        .row()
        .text("💵 Withdraw Investments", "withdraw")
        .row()
        .text("💳 Deposit More", "deposit")
        .row()
        .text("🔙 Back to Main", "main_menu");

      // Get user timezone from Telegram (if available) or use UTC
      const userTimezone = ctx.from?.language_code ? 
        Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
      
      const updateTime = new Date().toLocaleString('en-US', {
        timeZone: userTimezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
      
      message += `⏰ *Updated: ${updateTime}*`;

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

    } catch (error) {
      console.error("Error in portfolio command:", error);
      await ctx.reply("❌ Error fetching portfolio data. Please try again.");
    }
  },
};

// Handle portfolio details callback
export const handlePortfolioDetails = async (ctx: BotContext) => {
  try {
    const userId = ctx.session.userId;
    if (!userId) return;

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.answerCallbackQuery("No wallet found");
      return;
    }

    // Check if user has Smart Wallet and use appropriate address
    const { hasCoinbaseSmartWallet, getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
    let walletAddress = wallet.address as Address;
    
    if (hasCoinbaseSmartWallet(userId)) {
      const smartWallet = await getCoinbaseSmartWallet(userId);
      if (smartWallet) {
        walletAddress = smartWallet.smartAccount.address;
        console.log(`📍 Using Smart Wallet address for portfolio callback: ${walletAddress}`);
      }
    }
    const { getMorphoBalance } = await import("../services/morpho-defi");
    const [aaveBalance, fluidBalance, compoundBalance, morphoBalance] = await Promise.all([
      getAaveBalance(walletAddress),
      getFluidBalance(walletAddress),
      getCompoundBalance(walletAddress),
      getMorphoBalance(wallet.address as Address) // Use regular wallet address like start-help.ts
    ]);
    
    const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
    const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
    const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
    const morphoBalanceNum = parseFloat(morphoBalance.assetsFormatted);
    
    if (aaveBalanceNum === 0 && fluidBalanceNum === 0 && compoundBalanceNum === 0 && morphoBalanceNum === 0) {
      await ctx.answerCallbackQuery("No active positions found");
      return;
    }

    await ctx.answerCallbackQuery();

    // Fetch real-time APY data
    let aaveApy = 5.69;
    let fluidApy = 7.72;
    let compoundApy = 7.65;
    let morphoApy = 10.0;
    
    try {
      const { fetchProtocolApy } = await import("../lib/defillama-api");
      const [realAaveApy, realFluidApy, realCompoundApy, realMorphoApy] = await Promise.allSettled([
        fetchProtocolApy("AAVE"),
        fetchProtocolApy("FLUID"), 
        fetchProtocolApy("COMPOUND"),
        fetchProtocolApy("MORPHO")
      ]);
      
      if (realAaveApy.status === 'fulfilled') aaveApy = realAaveApy.value;
      if (realFluidApy.status === 'fulfilled') fluidApy = realFluidApy.value;
      if (realCompoundApy.status === 'fulfilled') compoundApy = realCompoundApy.value;
      if (realMorphoApy.status === 'fulfilled') morphoApy = realMorphoApy.value;
    } catch (error) {
      console.warn("Failed to fetch real-time APY for portfolio details:", error);
    }
    
    let message = `📈 **Portfolio Details**\n\n`;
    
    // Show positions in order of APY (highest first)
    if (morphoBalanceNum > 0) {
      message += `**🔬 Morpho PYTH/USDC Position Details**\n\n`;
      message += `🟢 **USDC Lending Position**\n`;
      message += `• **Current Deposit**: $${morphoBalanceNum.toFixed(2)}\n`;
      message += `• **Token**: Morpho PYTH/USDC Vault Shares\n`;
      message += `• **Protocol**: Morpho Blue via MetaMorpho\n`;
      message += `• **Chain**: Base Network\n`;
      message += `• **Current APY**: ${morphoApy}%\n`;
      message += `• **Status**: ✅ Active & Auto-Compounding\n`;
      const morphoRiskScore = 5; // Morpho is medium risk
      const riskEmoji = riskIcon(morphoRiskScore);
      message += `• **Risk Level**: ${riskEmoji} Medium (${morphoRiskScore}/10) - Higher yield strategy\n\n`;
    }
    
    if (compoundBalanceNum > 0) {
      message += `**🏦 Compound V3 Position Details**\n\n`;
      message += `🟢 **USDC Lending Position**\n`;
      message += `• **Current Deposit**: $${compoundBalanceNum.toFixed(2)}\n`;
      message += `• **Token**: cUSDCv3 (Compound interest-bearing USDC)\n`;
      message += `• **Protocol**: Compound V3\n`;
      message += `• **Chain**: Base Network\n`;
      message += `• **Current APY**: ${compoundApy}%\n`;
      message += `• **Status**: ✅ Active & Auto-Compounding\n`;
      message += `• **Risk Level**: 🟢 Low (Compound is battle-tested)\n\n`;
    }
    
    if (fluidBalanceNum > 0) {
      message += `**🌊 Fluid Finance Position Details**\n\n`;
      message += `🟢 **USDC Lending Position**\n`;
      message += `• **Current Deposit**: $${fluidBalanceNum.toFixed(2)}\n`;
      message += `• **Token**: fUSDC (Fluid interest-bearing USDC)\n`;
      message += `• **Protocol**: Fluid Finance\n`;
      message += `• **Chain**: Base Network\n`;
      message += `• **Current APY**: ${fluidApy}%\n`;
      message += `• **Status**: ✅ Active & Auto-Compounding\n`;
      message += `• **Risk Level**: 🟢 Low (InstaDApp backed)\n\n`;
    }

    if (aaveBalanceNum > 0) {
      message += `**🏛️ Aave V3 Position Details**\n\n`;
      message += `🟢 **USDC Lending Position**\n`;
      message += `• **Current Deposit**: $${aaveBalanceNum.toFixed(2)}\n`;
      message += `• **Token**: aUSDC (Aave interest-bearing USDC)\n`;
      message += `• **Protocol**: Aave V3\n`;
      message += `• **Chain**: Base Network\n`;
      message += `• **Current APY**: ${aaveApy}%\n`;
      message += `• **Status**: ✅ Active & Auto-Compounding\n`;
      message += `• **Risk Level**: 🟢 Low (Aave is battle-tested)\n\n`;
    }
    
    message += `**📊 Position Analysis**\n`;
    message += `• **Real-Time Balance**: Fetched from blockchain\n`;
    message += `• **Liquidity**: Can withdraw anytime\n`;
    message += `• **Rewards**: Auto-compounding in aUSDC\n`;
    message += `• **Contract**: \`${BASE_TOKENS.aUSDC.slice(0, 8)}...\`\n\n`;
    
    message += `**⚡ Available Actions**\n`;
    message += `• **Withdraw Investments**: Get all funds back to wallet\n`;
    message += `• **Add More**: Zap additional USDC to pool\n\n`;

    const keyboard = new InlineKeyboard()
      .text("🦑 Earn More", "zap_funds")
      .row()
      .text("💵 Withdraw Investments", "withdraw")
      .row()
      .text("🔙 Back to Portfolio", "view_portfolio")
      .text("🔄 Refresh Data", "portfolio_details");

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });

  } catch (error) {
    console.error("Error showing portfolio details:", error);
    await ctx.answerCallbackQuery("❌ Error loading details");
  }
};

export default portfolioHandler;