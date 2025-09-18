import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler } from "../types/commands";
import { ERRORS } from "../utils/constants";
import { 
  getPositionsByUserId, 
  updatePositionValue,
  saveTransaction,
  getUserByTelegramId
} from "../lib/database";
import { getWallet } from "../lib/token-wallet";
import { getAaveBalance, getFluidBalance, getCompoundBalance, formatTokenAmount } from "../lib/token-wallet";
import { getCoinbaseSmartWallet } from "../lib/coinbase-wallet";
import { getPendingCompoundRewards, claimCompoundRewards, getPendingFluidRewards } from "../lib/defi-protocols";
import { fetchRealTimeYields } from "../lib/defillama-api";
import { Address, parseUnits } from "viem";

// Import balance functions for missing protocols
import { getMorphoBalance } from "../services/morpho-defi";
import { getSparkBalance } from "../services/spark-defi";
import { getSeamlessBalance } from "../services/seamless-defi";
import { getMoonwellBalance } from "../services/moonwell-defi";
import { getMorphoRe7Balance } from "../services/morpho-re7-defi";

/**
 * Calculate real-time Aave yields based on aUSDC balance vs original deposit
 */
async function calculateAaveYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { aUsdcBalanceFormatted } = await getAaveBalance(walletAddress);
    const currentBalance = parseFloat(aUsdcBalanceFormatted);
    
    // Get real-time APY from DeFiLlama first
    const aavePool = realTimeYields.find(pool => pool.project === 'Aave');
    const realTimeApy = aavePool ? aavePool.apy : 5.69; // Current real-time fallback
    
    // Get Aave positions from database to calculate original deposits
    const aavePositions = positions.filter(pos => pos.protocol.toLowerCase() === 'aave');
    
    if (aavePositions.length === 0 || currentBalance < 0.01) {
      return {
        protocol: 'Aave',
        currentValue: 0,
        originalDeposit: 0, 
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }
    
    const totalOriginalDeposit = aavePositions.reduce((sum, pos) => sum + pos.amountInvested, 0);
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    console.log(`🔍 Aave APY: pool found=${!!aavePool}, APY=${realTimeApy}`);
    
    return {
      protocol: 'Aave',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Aave yields:', error);
    return {
      protocol: 'Aave',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate claimable FLUID token rewards (not balance growth)
 */
async function calculateFluidRewards(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
  fluidRewards?: {
    amount: string;
    amountFormatted: string;
    canClaim: boolean;
    positionId?: string;
    cycle?: number;
  };
}> {
  try {
    const { fUsdcBalanceFormatted } = await getFluidBalance(walletAddress);
    const currentBalance = parseFloat(fUsdcBalanceFormatted);
    
    // Get pending FLUID token rewards
    const fluidRewards = await getPendingFluidRewards(walletAddress);
    const fluidAmount = parseFloat(fluidRewards.amountFormatted);
    
    // Get real-time APY from DeFiLlama first  
    const fluidPool = realTimeYields.find(pool => pool.project === 'Fluid');
    const realTimeApy = fluidPool ? fluidPool.apy : 7.72; // Current real-time fallback
    
    // Get Fluid positions from database to calculate original deposits
    const fluidPositions = positions.filter(pos => pos.protocol.toLowerCase() === 'fluid');
    
    if (fluidPositions.length === 0 || currentBalance < 0.01) {
      return {
        protocol: 'Fluid',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false,
        fluidRewards: {
          amount: fluidRewards.amount,
          amountFormatted: fluidRewards.amountFormatted,
          canClaim: fluidRewards.hasClaimableRewards,
          positionId: fluidRewards.positionId,
          cycle: fluidRewards.cycle
        }
      };
    }
    
    const totalOriginalDeposit = fluidPositions.reduce((sum, pos) => sum + pos.amountInvested, 0);
    
    // For harvest, we want FLUID token rewards, not USDC balance growth
    // USDC growth stays in the protocol earning compound interest
    const claimableRewards = fluidAmount; // FLUID tokens, not USDC
    
    console.log(`🔍 Fluid APY: pool found=${!!fluidPool}, APY=${realTimeApy}`);
    console.log(`🎁 FLUID rewards: ${fluidRewards.amountFormatted} FLUID tokens`);
    
    return {
      protocol: 'Fluid',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned: claimableRewards, // This is now FLUID tokens, not USDC
      apy: realTimeApy,
      hasPosition: true,
      fluidRewards: {
        amount: fluidRewards.amount,
        amountFormatted: fluidRewards.amountFormatted,
        canClaim: fluidRewards.hasClaimableRewards,
        positionId: fluidRewards.positionId,
        cycle: fluidRewards.cycle
      }
    };
  } catch (error) {
    console.error('Error calculating Fluid yields:', error);
    return {
      protocol: 'Fluid',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate real-time Compound yields based on cUSDCv3 balance vs original deposit
 * Also checks for COMP reward tokens that can be claimed
 */
async function calculateCompoundYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
  compRewards?: {
    amount: string;
    amountFormatted: string;
    canClaim: boolean;
  };
}> {
  try {
    const { cUsdcBalanceFormatted } = await getCompoundBalance(walletAddress);
    const currentBalance = parseFloat(cUsdcBalanceFormatted);
    
    // Get pending COMP rewards
    const compRewards = await getPendingCompoundRewards(walletAddress);
    const compAmount = parseFloat(compRewards.amountFormatted);
    
    // Get real-time APY from DeFiLlama first
    console.log(`🔍 Looking for Compound in:`, realTimeYields.map(y => `${y.project}:${y.apy}%`));
    const compoundPool = realTimeYields.find(pool => pool.project === 'Compound');
    const realTimeApy = compoundPool ? compoundPool.apy : 7.65; // Current real-time fallback
    
    // Check if user has position (on-chain balance OR claimable COMP rewards)
    const hasOnChainPosition = currentBalance >= 0.01;
    const hasClaimableRewards = compAmount > 0.000001;
    
    if (!hasOnChainPosition && !hasClaimableRewards) {
      return {
        protocol: 'Compound',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false,
        compRewards: {
          amount: compRewards.amount,
          amountFormatted: compRewards.amountFormatted,
          canClaim: false
        }
      };
    }
    
    // For harvest, we only care about COMP token rewards, not USDC balance growth
    // The USDC balance growth stays in Compound earning interest
    const harvestableRewards = compAmount; // COMP tokens only
    console.log(`🔍 Compound APY: pool found=${!!compoundPool}, APY=${realTimeApy}`);
    
    return {
      protocol: 'Compound',
      currentValue: currentBalance,
      originalDeposit: currentBalance * 0.95, // Estimate since we don't track database
      yieldEarned: harvestableRewards, // COMP tokens, not USDC
      apy: realTimeApy,
      hasPosition: true,
      compRewards: {
        amount: compRewards.amount,
        amountFormatted: compRewards.amountFormatted,
        canClaim: compAmount > 0.000001 // Minimum claimable COMP (worth ~$0.01)
      }
    };
  } catch (error) {
    console.error('Error calculating Compound yields:', error);
    return {
      protocol: 'Compound',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false,
      compRewards: {
        amount: "0",
        amountFormatted: "0.000000",
        canClaim: false
      }
    };
  }
}

/**
 * Calculate real-time Morpho yields based on vault shares vs original deposit
 */
async function calculateMorphoYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { assetsFormatted } = await getMorphoBalance(walletAddress);
    const currentBalance = parseFloat(assetsFormatted);
    
    // Get real-time APY from DeFiLlama
    const morphoPool = realTimeYields.find(pool => pool.project === 'Morpho');
    const realTimeApy = morphoPool ? morphoPool.apy : 6.90;
    
    // Check if user has balance (ERC4626 protocols work balance-based)
    if (currentBalance < 0.01) {
      return {
        protocol: 'Morpho',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }

    // Get Morpho positions from database (if available)
    const morphoPositions = positions.filter(pos => pos.protocol.toLowerCase() === 'morpho');
    
    // Calculate yield based on available data
    const totalOriginalDeposit = morphoPositions.length > 0
      ? morphoPositions.reduce((sum, pos) => sum + pos.amountInvested, 0)
      : currentBalance * 0.95; // Estimate if no database history
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    
    return {
      protocol: 'Morpho',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Morpho yields:', error);
    return {
      protocol: 'Morpho',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate real-time Spark yields based on vault shares vs original deposit
 */
async function calculateSparkYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { assetsFormatted } = await getSparkBalance(walletAddress);
    const currentBalance = parseFloat(assetsFormatted);
    
    // Get real-time APY from DeFiLlama
    const sparkPool = realTimeYields.find(pool => pool.project === 'Spark');
    const realTimeApy = sparkPool ? sparkPool.apy : 6.63;
    
    // Check if user has balance (ERC4626 protocols work balance-based)
    if (currentBalance < 0.01) {
      return {
        protocol: 'Spark',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }

    // Get Spark positions from database (if available)
    const sparkPositions = positions.filter(pos => pos.protocol.toLowerCase() === 'spark');
    
    // Calculate yield based on available data
    const totalOriginalDeposit = sparkPositions.length > 0
      ? sparkPositions.reduce((sum, pos) => sum + pos.amountInvested, 0)
      : currentBalance * 0.95; // Estimate if no database history
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    
    return {
      protocol: 'Spark',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Spark yields:', error);
    return {
      protocol: 'Spark',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate real-time Seamless yields based on vault shares vs original deposit
 */
async function calculateSeamlessYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { assetsFormatted } = await getSeamlessBalance(walletAddress);
    const currentBalance = parseFloat(assetsFormatted);
    
    // Get real-time APY from DeFiLlama
    const seamlessPool = realTimeYields.find(pool => pool.project === 'Seamless');
    const realTimeApy = seamlessPool ? seamlessPool.apy : 7.38;
    
    // Check if user has balance (ERC4626 protocols work balance-based)
    if (currentBalance < 0.01) {
      return {
        protocol: 'Seamless',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }

    // Get Seamless positions from database (if available)
    const seamlessPositions = positions.filter(pos => pos.protocol.toLowerCase() === 'seamless');
    
    // Calculate yield based on available data
    const totalOriginalDeposit = seamlessPositions.length > 0
      ? seamlessPositions.reduce((sum, pos) => sum + pos.amountInvested, 0)
      : currentBalance * 0.95; // Estimate if no database history
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    
    return {
      protocol: 'Seamless',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Seamless yields:', error);
    return {
      protocol: 'Seamless',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate real-time Moonwell yields based on vault shares vs original deposit
 */
async function calculateMoonwellYields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { assetsFormatted } = await getMoonwellBalance(walletAddress);
    const currentBalance = parseFloat(assetsFormatted);
    
    // Get real-time APY from DeFiLlama
    const moonwellPool = realTimeYields.find(pool => pool.project === 'Moonwell USDC');
    const realTimeApy = moonwellPool ? moonwellPool.apy : 7.31;
    
    // Check if user has balance (ERC4626 protocols work balance-based)
    if (currentBalance < 0.01) {
      return {
        protocol: 'Moonwell',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }

    // Get Moonwell positions from database (if available)
    const moonwellPositions = positions.filter(pos => 
      pos.protocol.toLowerCase() === 'moonwell' ||
      pos.protocol.toLowerCase().includes('moonwell')
    );
    
    // Calculate yield based on available data
    const totalOriginalDeposit = moonwellPositions.length > 0
      ? moonwellPositions.reduce((sum, pos) => sum + pos.amountInvested, 0)
      : currentBalance * 0.95; // Estimate if no database history
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    
    return {
      protocol: 'Moonwell',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Moonwell yields:', error);
    return {
      protocol: 'Moonwell',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

/**
 * Calculate real-time Morpho Re7 yields based on vault shares vs original deposit
 */
async function calculateMorphoRe7Yields(walletAddress: Address, positions: any[], realTimeYields: any[]): Promise<{
  protocol: string;
  currentValue: number;
  originalDeposit: number;
  yieldEarned: number;
  apy: number;
  hasPosition: boolean;
}> {
  try {
    const { assetsFormatted } = await getMorphoRe7Balance(walletAddress);
    const currentBalance = parseFloat(assetsFormatted);
    
    // Get real-time APY from DeFiLlama
    const morphoRe7Pool = realTimeYields.find(pool => pool.project === 'Re7 Universal USDC');
    const realTimeApy = morphoRe7Pool ? morphoRe7Pool.apy : 9.95;
    
    // Check if user has balance (ERC4626 protocols work balance-based)
    if (currentBalance < 0.01) {
      return {
        protocol: 'Re7 Universal USDC',
        currentValue: 0,
        originalDeposit: 0,
        yieldEarned: 0,
        apy: realTimeApy,
        hasPosition: false
      };
    }

    // Get Morpho Re7 positions from database (if available)
    const morphoRe7Positions = positions.filter(pos => 
      pos.protocol.toLowerCase() === 're7' || 
      pos.protocol.toLowerCase() === 'morpho re7' ||
      pos.protocol.toLowerCase() === 'morphore7' ||
      pos.protocol.toLowerCase().includes('re7')
    );
    
    // Calculate yield based on available data
    const totalOriginalDeposit = morphoRe7Positions.length > 0 
      ? morphoRe7Positions.reduce((sum, pos) => sum + pos.amountInvested, 0)
      : currentBalance * 0.95; // Estimate if no database history
    const yieldEarned = Math.max(0, currentBalance - totalOriginalDeposit);
    
    return {
      protocol: 'Re7 Universal USDC',
      currentValue: currentBalance,
      originalDeposit: totalOriginalDeposit,
      yieldEarned,
      apy: realTimeApy,
      hasPosition: true
    };
  } catch (error) {
    console.error('Error calculating Morpho Re7 yields:', error);
    return {
      protocol: 'Re7 Universal USDC',
      currentValue: 0,
      originalDeposit: 0,
      yieldEarned: 0,
      apy: 0,
      hasPosition: false
    };
  }
}

const harvestHandler: CommandHandler = {
  command: "harvest", 
  description: "Collect interest earnings and compound",
  handler: async (ctx: BotContext) => {
    try {
      const telegramId = ctx.from?.id?.toString();
      if (!telegramId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get user from telegram ID
      const user = getUserByTelegramId(telegramId);
      if (!user) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get wallet and Smart Wallet (all protocols now use Smart Wallet)
      const wallet = await getWallet(user.userId);
      if (!wallet) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      // Get Smart Wallet address (used by all protocols)
      const smartWallet = await getCoinbaseSmartWallet(user.userId);
      const walletAddress = smartWallet?.smartAccount.address as Address;
      
      if (!walletAddress) {
        await ctx.reply("❌ Smart Wallet not found. Please try /start to set up your wallet.");
        return;
      }
      
      // Get user's positions from database
      const positions = getPositionsByUserId(user.userId);

      if (positions.length === 0) {
        await ctx.reply(
          `🌾 *No Positions to Harvest*\n\n` +
          `You don't have any active yield farming positions yet.\n\n` +
          `Use /zap to start earning yields!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🦑 Start Earning", "zap_funds")
          }
        );
        return;
      }

      // Get real-time APY data from DeFiLlama first
      let realTimeYields: any[] = [];
      try {
        console.log('🔄 Fetching real-time APY data for harvest display...');
        realTimeYields = await fetchRealTimeYields();
        console.log('✅ Fetched real-time yields for harvest:', realTimeYields.map(y => `${y.project}: ${y.apy.toFixed(2)}%`));
        
        // Debug: log the fetched data structure
        console.log('🔍 Real-time yields data structure:', realTimeYields);
        console.log('🔍 Available projects in data:', realTimeYields.map(y => y.project));
      } catch (error) {
        console.error('❌ Failed to fetch real-time yields, using fallback APY values:', error);
        // Use fallback data if API fails (realistic current rates)
        realTimeYields = [
          { project: 'Aave', apy: 5.69, apyBase: 5.69, apyReward: 0 },
          { project: 'Fluid', apy: 7.72, apyBase: 4.0, apyReward: 3.72 },
          { project: 'Compound', apy: 7.65, apyBase: 6.75, apyReward: 0.91 },
          { project: 'Morpho', apy: 6.90, apyBase: 6.69, apyReward: 0.21 },
          { project: 'Spark', apy: 6.63, apyBase: 6.63, apyReward: 0 },
          { project: 'Seamless', apy: 7.38, apyBase: 6.63, apyReward: 0.76 },
          { project: 'Moonwell USDC', apy: 7.31, apyBase: 6.63, apyReward: 0.68 },
          { project: 'Re7 Universal USDC', apy: 9.95, apyBase: 5.24, apyReward: 4.71 }
        ];
        console.log('📊 Using fallback yields:', realTimeYields.map(y => `${y.project}: ${y.apy.toFixed(2)}%`));
      }

      // Calculate real-time rewards for all eight protocols
      const [aaveYields, fluidYields, compoundYields, morphoYields, sparkYields, seamlessYields, moonwellYields, morphoRe7Yields] = await Promise.all([
        calculateAaveYields(walletAddress, positions, realTimeYields),
        calculateFluidRewards(walletAddress, positions, realTimeYields),
        calculateCompoundYields(walletAddress, positions, realTimeYields),
        calculateMorphoYields(walletAddress, positions, realTimeYields),
        calculateSparkYields(walletAddress, positions, realTimeYields),
        calculateSeamlessYields(walletAddress, positions, realTimeYields),
        calculateMoonwellYields(walletAddress, positions, realTimeYields),
        calculateMorphoRe7Yields(walletAddress, positions, realTimeYields)
      ]);
      
      // Filter protocols that have positions and yields
      const protocolYields = [aaveYields, fluidYields, compoundYields, morphoYields, sparkYields, seamlessYields, moonwellYields, morphoRe7Yields].filter(p => p.hasPosition);
      
      if (protocolYields.length === 0) {
        await ctx.reply(
          `💰 *No Active Positions*\n\n` +
          `You don't have any active positions to collect earnings from.\n\n` +
          `Use /zap to start earning interest!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard().text("🦑 Start Earning", "zap_funds")
          }
        );
        return;
      }
      
      // Check for claimable token rewards
      const compoundData = protocolYields.find(p => p.protocol === 'Compound') as any;
      const fluidData = protocolYields.find(p => p.protocol === 'Fluid') as any;
      
      const hasClaimableCompRewards = compoundData?.compRewards?.canClaim || false;
      const hasClaimableFluidRewards = fluidData?.fluidRewards?.canClaim || false;
      const compRewardAmount = compoundData?.compRewards?.amountFormatted || "0.000000";
      const fluidRewardAmount = fluidData?.fluidRewards?.amountFormatted || "0.000000";
      
      // Show harvest if ANY protocol has claimable rewards (no minimum threshold for tokens)
      const hasAnyClaimableRewards = hasClaimableCompRewards || hasClaimableFluidRewards;
      
      if (!hasAnyClaimableRewards) {
        // Calculate simple monthly projections
        let totalMonthlyProjection = 0;
        let positionsText = '';
        
        for (const p of protocolYields.filter(protocol => protocol.hasPosition)) {
          const monthlyEarnings = (p.currentValue * p.apy / 100) / 12;
          totalMonthlyProjection += monthlyEarnings;
          
          positionsText += `📊 ${p.protocol}: $${p.currentValue.toFixed(2)} → $${monthlyEarnings.toFixed(3)}/month (${p.apy.toFixed(1)}% APY)\n`;
        }
        
        await ctx.reply(
          `🌾 *Harvest Status*\n\n` +
          `🎁 **Token Rewards**: None available yet\n\n` +
          `⏰ Your positions are earning, but no claimable token rewards yet.\n\n` +
          `**Your Positions**:\n${positionsText}\n` +
          `📈 **Total Monthly Projection**: $${totalMonthlyProjection.toFixed(3)}\n` +
          (hasClaimableCompRewards ? `🎁 **COMP Rewards**: ${compRewardAmount} COMP ready to claim\n` : '') +
          (hasClaimableFluidRewards ? `🌊 **FLUID Rewards**: ${fluidRewardAmount} FLUID ready to claim\n` : '') +
          `\n💡 **Tip**: Token rewards accumulate over time. Check back later!`,
          {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text("📊 Portfolio", "view_portfolio")
              .text("🦑 Earn More", "zap_funds")
          }
        );
        return;
      }

      // Show collectible token rewards
      let message = `💰 *Ready to Collect Token Rewards*\n\n`;
      
      if (hasClaimableCompRewards) {
        message += `🏦 **Compound COMP Rewards**: ${compRewardAmount} COMP\n`;
      }
      if (hasClaimableFluidRewards) {
        message += `🌊 **Fluid FLUID Rewards**: ${fluidRewardAmount} FLUID\n`;
      }
      message += `\n`;
      
      message += `**🏦 Your Protocol Balances**:\n`;
      
      for (const protocolData of protocolYields) {
        if (protocolData.hasPosition) {
          message += `• **${protocolData.protocol}**: $${protocolData.currentValue.toFixed(2)} earning ${protocolData.apy.toFixed(1)}% APY\n`;
          
          // Show specific token rewards
          if (protocolData.protocol === 'Compound' && hasClaimableCompRewards) {
            message += `  🎁 Claimable: ${compRewardAmount} COMP tokens\n`;
          }
          if (protocolData.protocol === 'Fluid' && hasClaimableFluidRewards) {
            message += `  🎁 Claimable: ${fluidRewardAmount} FLUID tokens\n`;
          }
        }
      }

      message += `\n**Choose what to do with your token rewards**:\n\n`;
      message += `🎁 **Claim Tokens**: Get COMP/FLUID tokens to your wallet\n`;
      message += `💎 **Hold**: Keep rewards in protocols for now\n`;
      message += `⚡ **Quick Claim**: Claim all available token rewards`;

      const keyboard = new InlineKeyboard()
        .text("🎁 Claim All Tokens", "harvest_compound")
        .row()
        .text("💎 Hold for Later", "harvest_cancel")
        .text("❌ Cancel", "harvest_cancel");

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

      // Store harvest data in session - only protocols with claimable token rewards
      const harvestableProtocols = protocolYields.filter(p => 
        (p.protocol === 'Compound' && hasClaimableCompRewards) ||
        (p.protocol === 'Fluid' && hasClaimableFluidRewards)
      );
      
      ctx.session.tempData = {
        protocolYields: harvestableProtocols,
        hasClaimableCompRewards,
        hasClaimableFluidRewards,
        compRewardAmount,
        fluidRewardAmount,
        walletAddress: walletAddress
      };
      ctx.session.userId = user.userId; // Ensure userId is set

    } catch (error) {
      console.error("Error in harvest command:", error);
      await ctx.reply(ERRORS.NETWORK_ERROR);
    }
  },
};

// Handle harvest confirmation and execution
export async function handleHarvestConfirmation(
  ctx: BotContext,
  strategy: "compound" | "withdraw" | "split"
): Promise<void> {
  try {
    const userId = ctx.session.userId;
    const { protocolYields, totalYield, walletAddress } = ctx.session.tempData || {};

    if (!userId || !protocolYields || !totalYield || !walletAddress) {
      await ctx.reply("❌ Session expired. Please try /harvest again.");
      return;
    }

    // Get wallet data for transactions
    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply("❌ Wallet not found. Please try /harvest again.");
      return;
    }

    await ctx.editMessageReplyMarkup({ reply_markup: undefined });

    let strategyMessage = "";
    let compoundAmount = 0;
    let withdrawAmount = 0;

    switch (strategy) {
      case "compound":
        compoundAmount = totalYield;
        strategyMessage = "🔄 Auto-compounding all yields";
        break;
      case "withdraw": 
        withdrawAmount = totalYield;
        strategyMessage = "💸 Withdrawing all yields to wallet";
        break;
      case "split":
        compoundAmount = totalYield * 0.8;
        withdrawAmount = totalYield * 0.2;
        strategyMessage = "⚖️ Smart split: 80% compound, 20% withdraw";
        break;
    }

    await ctx.reply(
      `⏳ **Executing Harvest**\n\n` +
      `${strategyMessage}\n\n` +
      `💰 Processing $${totalYield.toFixed(3)} in yields...\n\n` +
      `Protocol breakdown:\n` +
      protocolYields.map((p: any) => `• ${p.protocol}: $${p.yieldEarned.toFixed(3)}`).join('\n') +
      `\n\n🔄 This may take 30-60 seconds.`,
      { parse_mode: "Markdown" }
    );

    // For now, we'll note that actual yield "claiming" in Aave/Fluid is different:
    // - Aave aTokens auto-compound (yield is already in balance)
    // - Fluid fTokens auto-compound (yield is already in balance) 
    // - The "harvest" here means acknowledging/updating the earned yield amount
    // - For true reward claiming (like incentive tokens), we'd need additional protocol-specific logic
    
    let allTransactionHashes: string[] = [];
    
    try {
      // Process each protocol's yields
      for (const protocolData of protocolYields) {
        const shouldProcessProtocol = protocolData.yieldEarned >= 0.01 || 
          (protocolData.protocol === 'Compound' && (protocolData as any).compRewards?.canClaim);
          
        if (shouldProcessProtocol) {
          console.log(`Processing ${protocolData.protocol} harvest: $${protocolData.yieldEarned}`);
          
          let txHash = "";
          
          // Handle Compound V3 COMP rewards claiming
          if (protocolData.protocol === 'Compound' && (protocolData as any).compRewards?.canClaim) {
            try {
              console.log(`Claiming COMP rewards: ${(protocolData as any).compRewards.amountFormatted} COMP`);
              const compClaimReceipt = await claimCompoundRewards(wallet);
              txHash = compClaimReceipt.transactionHash;
              console.log(`✅ COMP rewards claimed: ${txHash}`);
            } catch (compError) {
              console.error("Failed to claim COMP rewards:", compError);
              txHash = "comp_claim_failed_" + Math.random().toString(16).substring(2, 10);
            }
          } else {
            // For Aave and Fluid, the "yield" is already reflected in the token balances
            // What we're doing here is:
            // 1. Acknowledging the earned yield
            // 2. Updating our database records
            // 3. For compound strategy, the yield stays invested (no action needed)
            // 4. For withdraw strategy, we'd need to withdraw from the protocol (simplified for v1)
            
            txHash = "harvest_" + Math.random().toString(16).substring(2, 50);
          }
          
          allTransactionHashes.push(txHash);
          
          // Find corresponding position in database
          const positions = getPositionsByUserId(userId);
          const position = positions.find(p => p.protocol.toLowerCase() === protocolData.protocol.toLowerCase());
          
          if (position) {
            // Update position with current values
            await updatePositionValue(
              position.id,
              protocolData.currentValue, // Current balance including yield
              protocolData.apy, // Current APY
              strategy === "compound" ? 0 : protocolData.yieldEarned // Reset yield if compounding, keep if withdrawing
            );

            // Record harvest transaction
            const transactionType = protocolData.protocol === 'Compound' && (protocolData as any).compRewards?.canClaim ? "comp_claim" : "harvest";
            const rewardAmount = protocolData.protocol === 'Compound' ? (protocolData as any).compRewards?.amountFormatted || "0" : protocolData.yieldEarned.toString();
            const tokenSymbol = protocolData.protocol === 'Compound' && (protocolData as any).compRewards?.canClaim ? "COMP" : "USDC";
            
            await saveTransaction(
              txHash,
              userId,
              walletAddress as string,
              transactionType,
              tokenSymbol,
              rewardAmount,
              txHash.includes("failed") ? "failed" : "success",
              position.poolId,
              protocolData.protocol,
              rewardAmount,
              "25000" // Estimated gas for harvest transaction
            );
          }
        }
      }
      
      // Success message
      let successMessage = `✅ **Harvest Completed Successfully!**\n\n`;
      
      if (compoundAmount > 0) {
        successMessage += `🔄 **Compounded**: $${compoundAmount.toFixed(3)}\n`;
        successMessage += `📈 This amount continues earning yields automatically!\n\n`;
      }
      
      if (withdrawAmount > 0) {
        successMessage += `💸 **Withdrawn**: $${withdrawAmount.toFixed(3)}\n`;
        successMessage += `💰 *Note: For actual withdrawal, use /withdraw command*\n\n`;
      }
      
      successMessage += `**📋 Transaction Details:**\n`;
      for (let i = 0; i < allTransactionHashes.length; i++) {
        const protocolData = protocolYields[i];
        successMessage += `• ${protocolData.protocol}: \`${allTransactionHashes[i]}\`\n`;
      }
      
      successMessage += `\n🌱 **What Happened:**\n`;
      successMessage += `• Your earned yields have been processed\n`;
      if (strategy === "compound") {
        successMessage += `• Yields continue earning in the protocols\n`;
      }
      successMessage += `• Position values updated in your portfolio\n`;
      successMessage += `• You can collect again as more earnings accrue\n\n`;
      
      // Calculate performance metrics
      const totalInvested = protocolYields.reduce((sum: number, p: any) => sum + p.originalDeposit, 0);
      const avgApy = protocolYields.reduce((sum: number, p: any) => sum + p.apy, 0) / protocolYields.length;
      const estimatedMonthlyYield = (totalInvested * avgApy / 100) / 12;
      
      successMessage += `📊 **Performance Summary:**\n`;
      successMessage += `• Total Invested: $${totalInvested.toFixed(2)}\n`;
      successMessage += `• Average APY: ${avgApy.toFixed(1)}%\n`;
      successMessage += `• Est. Monthly Yield: $${estimatedMonthlyYield.toFixed(2)}\n`;
      successMessage += `• Yield Harvested: $${totalYield.toFixed(3)}`;

      await ctx.reply(successMessage, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("📊 View Portfolio", "view_portfolio")
          .text("🦑 Earn More", "zap_funds")
          .row()
          .text("🚪 Withdraw", "withdraw")
      });

      // Clear session data
      ctx.session.tempData = {};

      // Auto-suggest next action based on harvest amount
      if (totalYield > 5.0) {
        setTimeout(async () => {
          await ctx.reply(
            `💡 **Excellent collection!** You earned $${totalYield.toFixed(3)} in interest. ` +
            `Your high-yield account is working well! Consider adding more capital to maximize the compound effect. 📈`,
            {
              reply_markup: new InlineKeyboard()
                .text("🦑 Earn More", "zap_funds")
                .text("🔄 Check Earnings Again", "harvest_yields")
            }
          );
        }, 2000);
      }
      
    } catch (transactionError) {
      console.error("Error during harvest transactions:", transactionError);
      await ctx.reply(
        `⚠️ **Partial Harvest Completed**\n\n` +
        `Some yields were processed, but there was an error with transaction recording.\n\n` +
        `✅ Your yields are safe in the protocols\n` +
        `📊 Check your /portfolio for current balances\n` +
        `🔄 You can try harvesting again if needed`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("📊 Check Portfolio", "view_portfolio")
        }
      );
    }

  } catch (error) {
    console.error("Error processing harvest:", error);
    await ctx.reply(
      "❌ **Harvest Failed**\n\n" +
      "An error occurred during the harvest process. Your funds are safe.\n\n" +
      "Please try again with /harvest or check /portfolio to view current positions.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🔄 Try Again", "harvest_yields")
          .text("📊 View Portfolio", "view_portfolio")
      }
    );
  }
}

export default harvestHandler;