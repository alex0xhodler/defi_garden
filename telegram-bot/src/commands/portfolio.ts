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

      // Fetch real-time APY data only for protocols with active positions (performance optimization)
      let aaveApy = 5.69;
      let fluidApy = 7.72;
      let compoundApy = 7.65;
      let morphoApy = 10.0;
      let sparkApy = 8.0;
      let seamlessApy = 5.0;
      let moonwellApy = 5.0;
      let morphoRe7Apy = 6.0;
      
      try {
        const { getCachedMultipleProtocolAPYs } = await import("../utils/cached-apy-helper");
        
        // Build array of protocols only for those with active positions
        const activeProtocols: Array<'AAVE' | 'FLUID' | 'COMPOUND' | 'MORPHO' | 'SPARK' | 'SEAMLESS' | 'MOONWELL' | 'MORPHO_RE7'> = [];
        
        if (aaveBalanceNum > 0) activeProtocols.push('AAVE');
        if (fluidBalanceNum > 0) activeProtocols.push('FLUID');
        if (compoundBalanceNum > 0) activeProtocols.push('COMPOUND');
        if (morphoBalanceNum > 0) activeProtocols.push('MORPHO');
        if (sparkBalanceNum > 0) activeProtocols.push('SPARK');
        if (seamlessBalanceNum > 0) activeProtocols.push('SEAMLESS');
        if (moonwellBalanceNum > 0) activeProtocols.push('MOONWELL');
        if (morphoRe7BalanceNum > 0) activeProtocols.push('MORPHO_RE7');
        
        console.log(`📊 Portfolio: Using cached APY for ${activeProtocols.length} active protocols (optimization: avoiding ${8 - activeProtocols.length} unnecessary lookups)`);
        
        // Get cached APY values efficiently
        if (activeProtocols.length > 0) {
          const cachedAPYs = await getCachedMultipleProtocolAPYs(activeProtocols);
          
          // Map results back to protocol variables
          if (cachedAPYs.AAVE) aaveApy = cachedAPYs.AAVE;
          if (cachedAPYs.FLUID) fluidApy = cachedAPYs.FLUID;
          if (cachedAPYs.COMPOUND) compoundApy = cachedAPYs.COMPOUND;
          if (cachedAPYs.MORPHO) morphoApy = cachedAPYs.MORPHO;
          if (cachedAPYs.SPARK) sparkApy = cachedAPYs.SPARK;
          if (cachedAPYs.SEAMLESS) seamlessApy = cachedAPYs.SEAMLESS;
          if (cachedAPYs.MOONWELL) moonwellApy = cachedAPYs.MOONWELL;
          if (cachedAPYs.MORPHO_RE7) morphoRe7Apy = cachedAPYs.MORPHO_RE7;
        }
        
        console.log(`Portfolio APY rates: Aave ${aaveApy}%, Fluid ${fluidApy}%, Compound ${compoundApy}%, Morpho ${morphoApy}%, Spark ${sparkApy}%, Seamless ${seamlessApy}%, Moonwell ${moonwellApy}%, Morpho Re7 ${morphoRe7Apy}%`);
      } catch (error) {
        console.warn("Failed to fetch cached APY, using fallback rates:", error);
      }
      const totalValue = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + sparkBalanceNum + seamlessBalanceNum + moonwellBalanceNum + morphoRe7BalanceNum;
      
      let message = `📊 **Your DeFi Portfolio**\n\n`;
      
      // Real-time balances
      message += `💰 **Total Portfolio Value**: $${totalValue.toFixed(2)}\n`;
      message += `💳 **Wallet USDC**: $${usdcBalanceNum.toFixed(2)}\n`;
      message += `🏦 **Total Deposited**: $${totalValue.toFixed(2)}\n\n`;

      // Active positions (sorted by APY - highest first)
      if (morphoBalanceNum > 0) {
        message += `**🔬 Morpho PYTH/USDC Position**\n\n`;
        message += `🟢 **Morpho PYTH/USDC**\n`;
        message += `• **Current Deposit**: $${morphoBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${morphoApy}%\n`;
        message += `• **Protocol**: Morpho on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      if (morphoRe7BalanceNum > 0) {
        message += `**♾️ Re7 Universal USDC Position**\n\n`;
        message += `🟢 **Re7 Universal USDC**\n`;
        message += `• **Current Deposit**: $${morphoRe7BalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${morphoRe7Apy}%\n`;
        message += `• **Protocol**: Re7 Universal USDC via Morpho on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }
      
      if (sparkBalanceNum > 0) {
        message += `**⚡ Spark USDC Vault Position**\n\n`;
        message += `🟢 **Spark USDC Vault**\n`;
        message += `• **Current Deposit**: $${sparkBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${sparkApy}%\n`;
        message += `• **Protocol**: Spark via Morpho on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      if (seamlessBalanceNum > 0) {
        message += `**🌊 Seamless USDC Position**\n\n`;
        message += `🟢 **Seamless USDC**\n`;
        message += `• **Current Deposit**: $${seamlessBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${seamlessApy}%\n`;
        message += `• **Protocol**: Seamless via Morpho on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      if (moonwellBalanceNum > 0) {
        message += `**🌕 Moonwell USDC Position**\n\n`;
        message += `🟢 **Moonwell USDC**\n`;
        message += `• **Current Deposit**: $${moonwellBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${moonwellApy}%\n`;
        message += `• **Protocol**: Moonwell on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }
      
      if (compoundBalanceNum > 0) {
        message += `**🏦 Compound V3 Position**\n\n`;
        message += `🟢 **Compound USDC**\n`;
        message += `• **Current Deposit**: $${compoundBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${compoundApy}%\n`;
        message += `• **Protocol**: Compound V3 on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      if (fluidBalanceNum > 0) {
        message += `**🌊 Fluid Finance Position**\n\n`;
        message += `🟢 **Fluid USDC**\n`;
        message += `• **Current Deposit**: $${fluidBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${fluidApy}%\n`;
        message += `• **Protocol**: Fluid on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      if (aaveBalanceNum > 0) {
        message += `**🏛️ Aave V3 Position**\n\n`;
        message += `🟢 **Aave USDC**\n`;
        message += `• **Current Deposit**: $${aaveBalanceNum.toFixed(2)}\n`;
        message += `• **Current APY**: ${aaveApy}%\n`;
        message += `• **Protocol**: Aave V3 on Base\n`;
        message += `• **Status**: ✅ Active & Earning\n\n`;
      }

      // Performance note
      message += `📈 **Real-Time Data**\n`;
      message += `• Balance fetched from blockchain\n`;
      message += `• Reflects all deposits/withdrawals\n`;
      message += `• Auto-compounding rewards included\n\n`;

      // Quick actions
      const keyboard = new InlineKeyboard()
        .text("🦑 Earn More", "zap_funds")
        .text("🌾 Harvest", "harvest_yields")
        .row()
        .text("🚪 Exit Pool", "withdraw")
        .text("🔄 Refresh", "view_portfolio")
        .row()
        .text("💰 Check Balance", "check_balance");

      message += `⏰ *Updated: ${new Date().toLocaleTimeString()}*`;

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
      message += `• **Risk Level**: 🟡 Medium (5/10) - Higher yield strategy\n\n`;
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
    message += `• **Exit Pool**: Get all funds back to wallet\n`;
    message += `• **Add More**: Zap additional USDC to pool\n\n`;

    const keyboard = new InlineKeyboard()
      .text("🚪 Exit Pool", "withdraw")
      .text("🦑 Earn More", "zap_funds")
      .row()
      .text("🔄 Refresh Data", "portfolio_details")
      .text("🔙 Back to Portfolio", "view_portfolio");

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