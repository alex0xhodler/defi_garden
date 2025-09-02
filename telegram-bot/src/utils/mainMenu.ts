import { InlineKeyboard } from "grammy";
import { Address } from "viem";

/**
 * Create standardized main menu keyboard
 * This should be used across all commands to maintain consistency
 */
export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("💰 Check Balance", "check_balance")
    .text("🚀 Start Earning", "zap_funds")
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
export async function getMainMenuMessage(firstName: string = "there", walletAddress?: string, userId?: string): Promise<string> {
  const { getHighestAPY } = await import('../lib/defillama-api');
  const highestAPY = await getHighestAPY();
  
  // Check user's fund status if userId and wallet provided
  if (userId && walletAddress) {
    try {
      const { getCoinbaseWalletUSDCBalance, getCoinbaseSmartWallet } = await import('../lib/coinbase-wallet');
      const { getAaveBalance, getFluidBalance, getCompoundBalance } = await import('../lib/token-wallet');
      const { calculateRealTimeEarnings } = await import('./earnings');
      
      // Get Smart Wallet address for Compound deposits (since deposits are made via CDP)
      const smartWallet = await getCoinbaseSmartWallet(userId);
      const smartWalletAddress = smartWallet?.smartAccount.address;
      
      // Fetch wallet USDC and DeFi positions
      const [walletUsdc, aaveBalance, fluidBalance, compoundBalance] = await Promise.all([
        getCoinbaseWalletUSDCBalance(walletAddress as Address),
        getAaveBalance(walletAddress as Address),
        getFluidBalance(walletAddress as Address),
        // Check Compound balance on Smart Wallet address since deposits are made there
        smartWalletAddress ? getCompoundBalance(smartWalletAddress) : Promise.resolve({ cUsdcBalance: "0", cUsdcBalanceFormatted: "0.00" })
      ]);

      const walletUsdcNum = parseFloat(walletUsdc);
      const aaveBalanceNum = parseFloat(aaveBalance.aUsdcBalanceFormatted);
      const fluidBalanceNum = parseFloat(fluidBalance.fUsdcBalanceFormatted);
      const compoundBalanceNum = parseFloat(compoundBalance.cUsdcBalanceFormatted);
      
      const totalDeployed = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum;
      
      // STATE 1: User has active DeFi positions
      if (totalDeployed > 0.01) {
        const { getCompoundV3APY } = await import('../lib/defillama-api');
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
        message += `🚀 **Earning:** ${earnings} automatically\n\n`;
        message += `✅ Auto-compounding activated\n`;
        message += `✅ Withdraw anytime, zero lock-ups\n`;
        message += `✅ Gas-sponsored transactions\n\n`;
        message += `What would you like to do?`;
        
        return message;
      }
      
      // STATE 2: User has wallet USDC but not deployed
      if (walletUsdcNum > 0.01) {
        const { getCompoundV3APY } = await import('../lib/defillama-api');
        const apy = await getCompoundV3APY();
        
        let message = `🐙 *Welcome back ${firstName}!*\n\n`;
        message += `💰 **Ready to deploy:** $${walletUsdcNum.toFixed(2)} USDC\n\n`;
        message += `🚀 **Start earning ${apy}% APY** by deploying to Compound V3!\n\n`;
        message += `✅ Gasless transactions (we sponsor gas)\n`;
        message += `✅ Auto-compounding activated\n`;
        message += `✅ Withdraw anytime, zero lock-ups\n\n`;
        message += `Ready to start earning?`;
        
        return message;
      }
      
    } catch (error) {
      console.error('Error fetching user funds for main menu:', error);
      // Fall through to generic message
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
  } else {
    message += `✅ AI finds highest yields automatically\n` +
      `✅ Compounds 24/7 while you sleep\n` +
      `✅ Withdraw anytime, zero lock-ups\n\n`;
  }
  
  message += `Ready to take action?`;
  
  return message;
}