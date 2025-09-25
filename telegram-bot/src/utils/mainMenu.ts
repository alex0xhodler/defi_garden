import { InlineKeyboard } from "grammy";
import { Address } from "viem";

/**
 * Create standardized main menu keyboard
 * This should be used across all commands to maintain consistency
 */
export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🦑 Earn Interest", "zap_funds")
    .text("📊 Buy Index Tokens", "index_main")
    .row()
    .text("💼 Investments", "view_portfolio")
    .text("💰 Check Balance", "check_balance")
    .row()
    .text("🌿 Collect Earnings", "harvest_yields")
    .text("⚙️ Settings", "open_settings")
    .row()
    .text("📋 Help", "help");
}

/**
 * Main menu message text with portfolio check and user state detection
 */
export async function getMainMenuMessage(firstName: string = "there", walletAddress?: string, userId?: string): Promise<string> {
  const { getConsistentAPY } = await import('./consistent-apy');
  const highestAPY = await getConsistentAPY(userId, 'initial');
  
  // Check user's fund status if userId and wallet provided
  if (userId && walletAddress) {
    try {
      const { getCoinbaseWalletUSDCBalance, getCoinbaseSmartWallet } = await import('../lib/coinbase-wallet');
      const { getAaveBalance, getFluidBalance, getCompoundBalance } = await import('../lib/token-wallet');
      const { getMorphoBalance } = await import('../services/morpho-defi');
      const { getSparkBalance } = await import('../services/spark-defi');
      const { getSeamlessBalance } = await import('../services/seamless-defi');
      const { getMoonwellBalance } = await import('../services/moonwell-defi');
      const { getMorphoRe7Balance } = await import('../services/morpho-re7-defi');
      const { calculateRealTimeEarnings } = await import('./earnings');
      
      // Get Smart Wallet address for Compound deposits (since deposits are made via CDP)
      const smartWallet = await getCoinbaseSmartWallet(userId);
      const smartWalletAddress = smartWallet?.smartAccount.address;
      
      // Fetch wallet USDC and DeFi positions
      const [walletUsdc, aaveBalance, fluidBalance, compoundBalance, morphoBalance, sparkBalance, seamlessBalance, moonwellBalance, morphoRe7Balance] = await Promise.all([
        getCoinbaseWalletUSDCBalance(walletAddress as Address).catch(() => '0.00'),
        getAaveBalance(walletAddress as Address).catch(() => ({ aUsdcBalanceFormatted: '0.00' })),
        getFluidBalance(walletAddress as Address).catch(() => ({ fUsdcBalanceFormatted: '0.00' })),
        // Check Compound balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getCompoundBalance(smartWalletAddress).catch(() => ({ cUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ cUsdcBalanceFormatted: '0.00' }),
        // Check Morpho balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getMorphoBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        // Check Spark balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getSparkBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        // Check Seamless balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getSeamlessBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        // Check Moonwell balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getMoonwellBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        // Check Morpho Re7 balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getMorphoRe7Balance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' })
      ]);

      const walletUsdcNum = parseFloat(walletUsdc);
      const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
      const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
      const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
      const morphoBalanceNum = parseFloat(morphoBalance.assetsFormatted);
      const sparkBalanceNum = parseFloat(sparkBalance.assetsFormatted);
      const seamlessBalanceNum = parseFloat(seamlessBalance.assetsFormatted);
      const moonwellBalanceNum = parseFloat(moonwellBalance.assetsFormatted);
      const morphoRe7BalanceNum = parseFloat(morphoRe7Balance.assetsFormatted);
      
      const totalDeployed = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + sparkBalanceNum + seamlessBalanceNum + moonwellBalanceNum + morphoRe7BalanceNum;
      
      // STATE 1: User has active DeFi positions
      if (totalDeployed > 0.01) {
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
          const { fetchProtocolApy } = await import('../lib/defillama-api');
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
          
          console.log(`Main menu APY rates: Aave ${aaveApy}%, Fluid ${fluidApy}%, Compound ${compoundApy}%, Morpho ${morphoApy}%, Spark ${sparkApy}%, Seamless ${seamlessApy}%, Moonwell ${moonwellApy}%, Morpho Re7 ${morphoRe7Apy}%`);
        } catch (error) {
          console.warn("Failed to fetch real-time APY for main menu, using fallback rates:", error);
        }
        
        // Calculate weighted average APY for earnings calculation
        const totalValue = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + sparkBalanceNum + seamlessBalanceNum + moonwellBalanceNum + morphoRe7BalanceNum;
        const weightedApy = totalValue > 0 ? (
          (aaveBalanceNum * aaveApy + 
           fluidBalanceNum * fluidApy + 
           compoundBalanceNum * compoundApy + 
           morphoBalanceNum * morphoApy + 
           sparkBalanceNum * sparkApy + 
           seamlessBalanceNum * seamlessApy + 
           moonwellBalanceNum * moonwellApy + 
           morphoRe7BalanceNum * morphoRe7Apy) / totalValue
        ) : 0;
        
        const earnings = calculateRealTimeEarnings(totalDeployed, weightedApy);
        
        // Note: Index positions don't earn APY like DeFi positions, they track asset price performance
        
        let message = `🐙 *Welcome back ${firstName}!*\n\n`;
        message += `💰 **inkvest savings account:**\n`;
        
        if (morphoRe7BalanceNum > 0.01) {
          message += `• $${morphoRe7BalanceNum.toFixed(2)} in Re7 Universal USDC (${morphoRe7Apy}% APY)\n`;
        }
        if (morphoBalanceNum > 0.01) {
          message += `• $${morphoBalanceNum.toFixed(2)} in Morpho PYTH/USDC (${morphoApy}% APY)\n`;
        }
        if (sparkBalanceNum > 0.01) {
          message += `• $${sparkBalanceNum.toFixed(2)} in Spark USDC Vault (${sparkApy}% APY)\n`;
        }
        if (seamlessBalanceNum > 0.01) {
          message += `• $${seamlessBalanceNum.toFixed(2)} in Seamless USDC (${seamlessApy}% APY)\n`;
        }
        if (moonwellBalanceNum > 0.01) {
          message += `• $${moonwellBalanceNum.toFixed(2)} in Moonwell USDC (${moonwellApy}% APY)\n`;
        }
        if (compoundBalanceNum > 0.01) {
          message += `• $${compoundBalanceNum.toFixed(2)} in Compound V3 (${compoundApy}% APY)\n`;
        }
        if (aaveBalanceNum > 0.01) {
          message += `• $${aaveBalanceNum.toFixed(2)} in Aave V3 (${aaveApy}% APY)\n`;
        }
        if (fluidBalanceNum > 0.01) {
          message += `• $${fluidBalanceNum.toFixed(2)} in Fluid Protocol (${fluidApy}% APY)\n`;
        }
        
        // Add Index Positions
        let totalIndexValue = 0;
        try {
          const { getUserIndexPositions } = await import('../services/index-tokens/index-balance');
          const userIndexPositions = await getUserIndexPositions(userId);
          
          for (const position of userIndexPositions) {
            if (position.currentValue > 0.01) {
              const categoryEmoji = position.category === 'blue_chip' ? '🏦' : '📊';
              message += `• $${position.currentValue.toFixed(2)} in ${position.symbol} Index\n`;
              totalIndexValue += position.currentValue;
            }
          }
        } catch (error) {
          console.error('Error fetching index positions for main menu:', error);
        }
        
        const grandTotal = totalDeployed + totalIndexValue;
        message += `\n💸 **Total Value:** $${grandTotal.toFixed(2)}\n`;
        if (totalIndexValue > 0 && totalDeployed > 0) {
          message += `🦑 **DeFi Earnings:** ${earnings} automatically\n`;
          message += `📊 **Index Investments:** $${totalIndexValue.toFixed(2)} tracking market performance\n\n`;
        } else if (totalDeployed > 0) {
          message += `🦑 **Earning:** ${earnings} automatically\n\n`;
        } else if (totalIndexValue > 0) {
          message += `📊 **Index Investments:** $${totalIndexValue.toFixed(2)} tracking market performance\n\n`;
        }
        message += `✅ Interest compounds automatically\n`;
        message += `✅ Withdraw anytime, no penalties or lock-ups\n`;
        message += `✅ inkvest pays for the transaction\n\n`;
        message += `What would you like to do?`;
        
        return message;
      }
      
      // STATE 2: User has wallet USDC but not deployed
      if (walletUsdcNum > 0.01) {
        const { fetchRealTimeYields, getHighestAPY } = await import('../lib/defillama-api');
        
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
        } catch (error) {
          console.warn("Failed to fetch real-time yields for main menu, using fallback");
          // Try to get cached high APY
          try {
            apy = await getHighestAPY();
          } catch {
            // Use fallback
          }
        }
        
        let message = `🐙 *Welcome back ${firstName}!*\n\n`;
        message += `💰 **Ready to deploy:** $${walletUsdcNum.toFixed(2)} USDC\n\n`;
        message += `🦑 **Start earning ${apy}% APY** with the best available protocol!\n\n`;
        message += `✅ inkvest pays for the transaction\n`;
        message += `✅ Interest compounds automatically\n`;
        message += `✅ Withdraw anytime, no penalties or lock-ups\n\n`;
        message += `Ready to start earning?`;
        
        return message;
      }
      
    } catch (error: any) {
      console.error('Error fetching user funds for main menu:', error);
      
      // If API is rate limited, show a user-friendly message instead of falling through
      if (error?.status === 429 || error?.message?.includes('limit exceeded')) {
        // Get dynamic APY for rate-limited fallback
        let fallbackAPY = highestAPY;
        try {
          const { getHighestAPY } = await import('../lib/defillama-api');
          fallbackAPY = await getHighestAPY();
        } catch {
          // Use parameter fallback
        }
        
        return `🐙 *Welcome back ${firstName}!*\n\n` +
          `⚠️ **Experiencing high load** - Balance checking temporarily limited\n\n` +
          `🦑 **Start earning ${fallbackAPY}% APY** with the best available protocol!\n\n` +
          `✅ inkvest pays for the transaction\n` +
          `✅ Interest compounds automatically\n` +
          `✅ Withdraw anytime, no penalties or lock-ups\n\n` +
          `Ready to start earning?`;
      }
      
      // Fall through to generic message for other errors
    }
  }
  
  // STATE 3: Generic message for users who somehow reach main menu without funds
  // Note: This shouldn't happen with proper flow control
  let message = `🦑 *Welcome back ${firstName}! Earn ${highestAPY}% APY starting today.*\n\n`;
  
  if (walletAddress) {
    message += `💰 *Your inkvest deposit address:*\n\`${walletAddress}\`\n\n` +
      `Send USDC ↑ (on Base blockchain network) and watch your money grow.\n\n` +
      `✅ AI finds highest interest rates automatically\n` +
      `✅ Compounds 24/7 while you sleep\n` +
      `✅ Withdraw anytime, no penalties or lock-ups\n\n`;
  } else {
    message += `✅ AI finds highest interest rates automatically\n` +
      `✅ Compounds 24/7 while you sleep\n` +
      `✅ Withdraw anytime, no penalties or lock-ups\n\n`;
  }
  
  message += `Ready to take action?`;
  
  return message;
}