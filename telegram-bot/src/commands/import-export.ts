import { BotContext } from "../context";
import { importWallet, getWallet, getPrivateKey } from "../lib/token-wallet";
import { CommandHandler } from "../types/commands";
import { isValidPrivateKey } from "../utils/validators";
import { InlineKeyboard } from "grammy";
import { createConfirmationKeyboard } from "../utils/keyboardHelper";


/**
 * Handles the /import command. It initiates the process for a user to import an
 * existing wallet using a private key. It includes a safety check if a wallet already exists.
 * @command /import
 * @description Import wallet via private key.
 */
export const importHandler: CommandHandler = {
  command: "import",
  description: "Import wallet via private key",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // Check if user already has a wallet
      const existingWallet = await ctx.session.walletAddress;

      if (existingWallet) {
        const keyboard = new InlineKeyboard()
          .text("Yes, import new wallet", "confirm_import_wallet")
          .text("No, keep current wallet", "cancel_import_wallet");

        await ctx.reply(
          "⚠️ You already have a wallet set up. Importing a new wallet will replace your current one.\n\n" +
            "*Make sure you have exported your private key if you want to keep access to your current wallet.*\n\n" +
            "Do you want to continue?",
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
        return;
      }

      // Set current action
      ctx.session.currentAction = "import_wallet";

      await ctx.reply(
        "🔑 Please send your private key.\n\n" +
          "*For security reasons*:\n" +
          "- Private keys are stored in an encrypted format\n" +
          "- You can delete this message after I process it\n" +
          "- Never share your private key with anyone else\n" +
          "- You can cancel this operation by typing /cancel",
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error in import command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  },
};

/**
 * Handles the user's private key submission. It validates the key format,
 * imports the wallet, saves the new address to the session, and confirms success with the user.
 * @param {BotContext} ctx - The bot context containing the user's message and session.
 * @returns {Promise<void>}
 */
export async function handlePrivateKeyInput(ctx: BotContext): Promise<void> {
  try {
    const userId = ctx.session.userId;
    const privateKey = ctx.message?.text;

    if (!userId || !privateKey) {
      await ctx.reply("❌ Invalid request. Please try again.");
      return;
    }

    // Validate private key format
    if (!isValidPrivateKey(privateKey)) {
      await ctx.reply(
        "❌ Invalid private key format. Please provide a valid 64-character hexadecimal private key with or without 0x prefix.\n\n" +
          "Try again or type /cancel to abort."
      );
      return;
    }

    await ctx.reply("🔐 Importing your wallet...");

    // Import the wallet
    const wallet = await importWallet(userId, privateKey);
    ctx.session.walletAddress = wallet.address;

    // Reset current action
    ctx.session.currentAction = undefined;

    const keyboard = new InlineKeyboard()
      .text("💰 Check Balance", "check_balance");

    await ctx.reply(
      `✅ *Wallet imported successfully!*\n\n` +
        `*Address*: \`${wallet.address}\`\n\n` +
        `Now you can:\n` +
        `- Use /deposit to receive funds\n` +
        `- Use /balance to check your balance\n` +
        `- Use /buy to buy tokens with ETH`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error("Error handling private key input:", error);
    ctx.session.currentAction = undefined;
    await ctx.reply(
      "❌ An error occurred while importing your wallet. Please try again later."
    );
  }
}

/**
 * Handles the /export command. It performs critical safety checks to ensure a user
 * doesn't export a private key that cannot access all their funds (e.g., funds in a smart wallet).
 * If safe, it prompts the user for confirmation before displaying the key. If not safe, it initiates a mandatory fund migration flow.
 * @command /export
 * @description Display private key (with confirmation prompt).
 */
export const exportHandler: CommandHandler = {
  command: "export",
  description: "Display private key (with confirmation prompt)",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply("❌ Please start the bot first with /start command.");
        return;
      }

      // UNIVERSAL BALANCE CHECK - Check for Smart Wallet regardless of detection
      console.log(`🚀 ==> EXPORT SAFETY CHECK INITIATED FOR USER ${userId} <==`);
      
      const { hasCoinbaseSmartWallet, checkAllUSDCBalances } = await import("../lib/coinbase-wallet");
      const hasSmartWallet = hasCoinbaseSmartWallet(userId);
      
      // Get database wallet info for debugging
      const { getWalletByUserId: getDbWallet } = await import("../lib/database");
      const dbWallet = getDbWallet(userId);
      
      console.log(`🔍 DATABASE WALLET INFO - User ${userId}:`, {
        exists: !!dbWallet,
        type: dbWallet?.type || 'UNDEFINED',
        address: dbWallet?.address || 'UNDEFINED'
      });
      
      console.log(`🔍 SMART WALLET DETECTION - User ${userId}: hasSmartWallet=${hasSmartWallet} (based on type === 'coinbase-smart-wallet')`);
      
      // CRITICAL: ALWAYS attempt Smart Wallet balance check regardless of database type
      // This handles cases where database type is wrong or wallet was upgraded
      console.log(`🔍 ATTEMPTING UNIVERSAL Smart Wallet balance check for user ${userId}...`);
      let balances = null;
      try {
        balances = await checkAllUSDCBalances(userId);
        console.log(`💰 BALANCE CHECK RESULT - User ${userId}:`, {
          success: !!balances,
          smartWalletBalance: balances?.smartWalletBalance || 'NULL',
          eoaBalance: balances?.eoaBalance || 'NULL',
          totalBalance: balances?.totalBalance || 'NULL',
          smartWalletAddress: balances?.smartWalletAddress || 'NULL',
          eoaAddress: balances?.eoaAddress || 'NULL'
        });
      } catch (error: any) {
        console.log(`💰 BALANCE CHECK ERROR - User ${userId}:`, {
          error: error.message || 'Unknown error',
          stack: error.stack?.split('\n').slice(0, 3)
        });
      }
      
      // DEFI POSITION SAFETY CHECK - Use real blockchain balances like /portfolio 
      console.log(`🏦 CHECKING REAL DEFI POSITIONS - User ${userId} - fetching live blockchain balances`);
      
      // Get Smart Wallet for balance checks
      const { getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
      const smartWallet = await getCoinbaseSmartWallet(userId);
      const smartWalletAddress = smartWallet?.smartAccount?.address;
      
      // Get actual on-chain DeFi balances (same logic as /portfolio)
      const { getWallet: getTokenWallet, getAaveBalance, getFluidBalance, getCompoundBalance } = await import("../lib/token-wallet");
      const { getMorphoBalance } = await import("../services/morpho-defi");
      const { getSparkBalance } = await import("../services/spark-defi"); 
      const { getSeamlessBalance } = await import("../services/seamless-defi");
      const { getMoonwellBalance } = await import("../services/moonwell-defi");
      
      const tokenWallet = await getTokenWallet(userId);
      const walletAddress = tokenWallet?.address;
      
      // Fetch all real DeFi balances in parallel (with type checks)
      const [aaveBalance, fluidBalance, compoundBalance, morphoBalance, sparkBalance, seamlessBalance, moonwellBalance] = await Promise.allSettled([
        walletAddress ? getAaveBalance(walletAddress).catch(() => ({ aUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ aUsdcBalanceFormatted: '0.00' }),
        walletAddress ? getFluidBalance(walletAddress).catch(() => ({ fUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ fUsdcBalanceFormatted: '0.00' }),
        walletAddress ? getCompoundBalance(walletAddress).catch(() => ({ cUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ cUsdcBalanceFormatted: '0.00' }),
        walletAddress ? getMorphoBalance(walletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWalletAddress ? getSparkBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWalletAddress ? getSeamlessBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
        smartWalletAddress ? getMoonwellBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' })
      ]);
      
      // Parse balances (same logic as /portfolio)
      const aaveBalanceNum = parseFloat(aaveBalance.status === 'fulfilled' ? aaveBalance.value.aUsdcBalanceFormatted : '0.00');
      const fluidBalanceNum = parseFloat(fluidBalance.status === 'fulfilled' ? fluidBalance.value.fUsdcBalanceFormatted : '0.00');
      const compoundBalanceNum = parseFloat(compoundBalance.status === 'fulfilled' ? compoundBalance.value.cUsdcBalanceFormatted : '0.00');
      const morphoBalanceNum = parseFloat(morphoBalance.status === 'fulfilled' ? morphoBalance.value.assetsFormatted : '0.00');
      const sparkBalanceNum = parseFloat(sparkBalance.status === 'fulfilled' ? sparkBalance.value.assetsFormatted : '0.00');
      const seamlessBalanceNum = parseFloat(seamlessBalance.status === 'fulfilled' ? seamlessBalance.value.assetsFormatted : '0.00');
      const moonwellBalanceNum = parseFloat(moonwellBalance.status === 'fulfilled' ? moonwellBalance.value.assetsFormatted : '0.00');
      
      // Build array of actual active positions with real balances
      const actualActivePositions = [];
      if (aaveBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Aave', value: aaveBalanceNum });
      if (fluidBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Fluid', value: fluidBalanceNum });
      if (compoundBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Compound', value: compoundBalanceNum });
      if (morphoBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Morpho', value: morphoBalanceNum });
      if (sparkBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Spark', value: sparkBalanceNum });
      if (seamlessBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Seamless', value: seamlessBalanceNum });
      if (moonwellBalanceNum > 0.10) actualActivePositions.push({ protocol: 'Moonwell', value: moonwellBalanceNum });
      
      const totalPositionValue = actualActivePositions.reduce((sum, pos) => sum + pos.value, 0);
      
      console.log(`🏦 REAL DEFI POSITION CHECK RESULT - User ${userId}:`, {
        aave: `$${aaveBalanceNum.toFixed(2)}`,
        fluid: `$${fluidBalanceNum.toFixed(2)}`,
        compound: `$${compoundBalanceNum.toFixed(2)}`,
        morpho: `$${morphoBalanceNum.toFixed(2)}`,
        spark: `$${sparkBalanceNum.toFixed(2)}`,
        seamless: `$${seamlessBalanceNum.toFixed(2)}`,
        moonwell: `$${moonwellBalanceNum.toFixed(2)}`,
        totalActivePositions: actualActivePositions.length,
        totalPositionValue: `$${totalPositionValue.toFixed(2)}`,
        activePositions: actualActivePositions.map(pos => `${pos.protocol}: $${pos.value.toFixed(2)}`).join(', ')
      });
      
      // Use actualActivePositions instead of significantPositions for safety logic
      const significantPositions = actualActivePositions;

      // SAFETY DECISION LOGIC - Enhanced with comprehensive logging AND position checking
      if (balances) {
        console.log(`🦑 SMART WALLET BALANCES DETECTED - User ${userId} - initiating safety evaluation`);
        
        const smartWalletBalance = parseFloat(balances.smartWalletBalance);
        const eoaBalance = parseFloat(balances.eoaBalance);
        
        // totalPositionValue already calculated above from real blockchain balances
        const totalLockedValue = smartWalletBalance + totalPositionValue;
        
        console.log(`💰 COMPREHENSIVE VALUE ANALYSIS - User ${userId}:`, {
          smartWalletBalance: `$${smartWalletBalance.toFixed(2)}`,
          eoaBalance: `$${eoaBalance.toFixed(2)}`,
          totalBalance: `$${balances.totalBalance}`,
          defiPositionsValue: `$${totalPositionValue.toFixed(2)}`,
          totalLockedValue: `$${totalLockedValue.toFixed(2)}`,
          smartWalletAddress: balances.smartWalletAddress,
          eoaAddress: balances.eoaAddress,
          safetyThreshold: '$0.01',
          positionsCount: significantPositions.length
        });
        
        console.log(`🔍 ENHANCED SAFETY DECISION - User ${userId}:`, {
          liquidCheck: `smartWalletBalance (${smartWalletBalance.toFixed(2)}) > 0.01`,
          positionCheck: `significantPositions (${significantPositions.length}) > 0`,
          totalCheck: `totalLockedValue (${totalLockedValue.toFixed(2)}) > 0.01`,
          result: (smartWalletBalance > 0.01 || significantPositions.length > 0) ? '🚫 BLOCK EXPORT - FUNDS/POSITIONS LOCKED' : '✅ ALLOW EXPORT - SAFE',
          reasoning: (smartWalletBalance > 0.01 || significantPositions.length > 0)
            ? 'User has funds or positions locked in Smart Wallet that private key cannot access'
            : 'No significant funds or positions locked in Smart Wallet'
        });
        
        if (smartWalletBalance > 0.01 || significantPositions.length > 0) { 
          // CRITICAL PATH: Block export and require fund/position migration
          console.log(`🚫 BLOCKING PRIVATE KEY EXPORT - User ${userId} has locked value: $${totalLockedValue.toFixed(2)} (${smartWalletBalance.toFixed(2)} liquid + ${totalPositionValue.toFixed(2)} positions)`);
          console.log(`🔄 INITIATING MANDATORY FUND/POSITION MIGRATION FLOW - User ${userId}`);
          
          // Set current action for fund/position migration
          ctx.session.currentAction = "mandatory_fund_migration";
          
          // Build position summary for user display with real balances
          const positionSummary = significantPositions.length > 0 
            ? `\n\n📊 **Active Positions**: ${significantPositions.length} earning position${significantPositions.length > 1 ? 's' : ''}\n` +
              significantPositions.map(pos => `• ${pos.protocol}: $${pos.value.toFixed(2)}`).join('\n')
            : '';

          // Create keyboard with appropriate options
          const keyboard = new InlineKeyboard();
          if (significantPositions.length > 0) {
            keyboard.text("📊 Exit Positions First", "open_portfolio");
            if (smartWalletBalance > 0.01) {
              keyboard.row().text("🔄 Move Liquid Funds", "confirm_fund_migration");
            }
          } else {
            keyboard.text("🔄 Move Funds", "confirm_fund_migration");
          }

          await ctx.reply(
            `🔒 *Export Blocked*\n\n` +
            `Your private key only controls part of your funds.\n\n` +
            `💰 **Smart Wallet**: $${smartWalletBalance.toFixed(2)} USDC${positionSummary}\n\n` +
            `✅ ${significantPositions.length > 0 ? 'Exit positions first, then move remaining funds' : 'Move funds to unlock export (gasless)'}`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
          return;
        } else {
          // Smart Wallet balance is minimal - safe to proceed
          console.log(`✅ SMART WALLET BALANCE ACCEPTABLE - User ${userId}:`, {
            smartWalletBalance: `$${smartWalletBalance}`,
            belowThreshold: true,
            safetyStatus: 'EXPORT APPROVED - minimal Smart Wallet funds',
            note: 'Private key will control majority of user funds'
          });
          console.log(`✅ PROCEEDING TO PRIVATE KEY EXPORT - User ${userId} - safety requirements met`);
        }
      } else {
        // Balance check failed or returned null
        console.log(`⚠️ SMART WALLET BALANCE CHECK FAILED - User ${userId}:`, {
          hasSmartWallet: hasSmartWallet,
          balances: balances,
          databaseType: dbWallet?.type,
          possibleCauses: [
            'User has traditional wallet (not Smart Wallet)',
            'Smart Wallet detection failed',
            'Network/RPC error during balance check',
            'Wallet data corruption'
          ]
        });
        
        if (hasSmartWallet) {
          // Database says Smart Wallet but balance check failed - BLOCK for safety
          console.log(`🚫 SAFETY BLOCK TRIGGERED - User ${userId}:`, {
            reason: 'Smart Wallet detected in database but balance verification failed',
            action: 'BLOCKING export to prevent potential fund loss',
            recommendation: 'User should try again or contact support'
          });
          await ctx.reply(
            `🔒 *PRIVATE KEY EXPORT BLOCKED*\n\n` +
            `Unable to verify your wallet balances for security reasons.\n\n` +
            `This prevents accidentally exporting a private key that might not control all your funds.\n\n` +
            `Please try again in a moment.`
          );
          return;
        } else {
          // Traditional wallet or Smart Wallet balance check failed but not detected as Smart Wallet
          console.log(`🏦 TRADITIONAL WALLET PATH - User ${userId}:`, {
            hasSmartWallet: false,
            balanceCheckResult: 'failed/null',
            walletType: 'traditional (legacy)',
            safetyStatus: 'PROCEEDING - no Smart Wallet detected',
            privateKeyControls: 'all funds (traditional wallet)'
          });
          console.log(`🏦 PROCEEDING WITH TRADITIONAL WALLET EXPORT - User ${userId}`);
        }
      }

      // Check if user has any wallet (Smart or traditional)
      console.log(`🔍 FINAL WALLET VERIFICATION - User ${userId} - checking for any wallet existence`);
      const finalWallet = await getTokenWallet(userId);
      
      console.log(`💼 WALLET EXISTENCE CHECK - User ${userId}:`, {
        traditionalWallet: !!finalWallet,
        smartWallet: hasSmartWallet,
        walletAddress: finalWallet?.address || 'NONE',
        hasAnyWallet: !!(finalWallet || hasSmartWallet)
      });

      if (!finalWallet && !hasSmartWallet) {
        console.log(`❌ NO WALLET FOUND - User ${userId} - blocking export and requesting wallet creation`);
        await ctx.reply(
          "❌ You don't have a wallet yet.\n\n" +
            "Use /create to create a new wallet or /import to import an existing one."
        );
        return;
      }

      // Set current action for export confirmation flow
      console.log(`🔐 INITIATING EXPORT CONFIRMATION FLOW - User ${userId} - setting session action`);
      ctx.session.currentAction = "export_wallet";

      // Show warning and confirmation prompt
      console.log(`⚠️ DISPLAYING SECURITY WARNING - User ${userId} - awaiting user confirmation`);
      await ctx.reply(
        "⚠️ *SECURITY WARNING*\n\n" +
          "You are about to export your private key. This is sensitive information that gives complete control over your wallet funds.\n\n" +
          "*NEVER*:\n" +
          "- Share your private key with anyone\n" +
          "- Enter it on websites\n" +
          "- Take screenshots of it\n\n" +
          "Are you sure you want to proceed?",
        {
          parse_mode: "Markdown",
          reply_markup: createConfirmationKeyboard(),
        }
      );
    } catch (error) {
      console.error("🔑 ERROR in export command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  },
};

/**
 * Handles the user's confirmation to export their private key. If confirmed, it retrieves
 * the key, displays it to the user, and provides security reminders. If denied, it cancels the operation.
 * It includes a final balance check for smart wallets as a last line of defense.
 * @param {BotContext} ctx - The bot context.
 * @param {boolean} confirmed - Whether the user confirmed the export.
 * @returns {Promise<void>}
 */
export async function handleExportConfirmation(
  ctx: BotContext,
  confirmed: boolean
): Promise<void> {
  try {
    // Remove the confirmation keyboard
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch (error: any) {
      // Ignore "message is not modified" errors - this happens when message already has no keyboard
      if (!error.description?.includes("message is not modified")) {
        throw error;
      }
    }

    if (!confirmed) {
      // Check if user is in onboarding state (onboardingCompleted is null)
      const { getUserByTelegramId } = await import("../lib/database");
      const user = getUserByTelegramId(ctx.session.userId || "");
      
      if (user && user.onboardingCompleted === null) {
        // Get current highest APY
        const { getHighestAPY } = await import("../lib/defillama-api");
        const apy = await getHighestAPY();
        
        // User is still in onboarding - only export key option
        const keyboard = new InlineKeyboard()
          .text("🔑 Export Private Key", "export_key");

        await ctx.reply(
          "Operation cancelled. Your private key was not exported.\n\n" +
          `🚀 *Ready to start earning ${apy}% APY anyway?*\n` +
          "You can always export your key later from settings.",
          {
            reply_markup: keyboard,
          }
        );
      } else {
        // Get current highest APY
        const { getHighestAPY } = await import("../lib/defillama-api");
        const apy = await getHighestAPY();
        
        // User has completed onboarding - show full menu
        const keyboard = new InlineKeyboard()
          .text("💰 Send USDC to Address", "deposit")
          .row()
          .text("🚀 Start Earning", "zap_auto_deploy")
          .text("💰 Check Balance", "check_balance");

        await ctx.reply(
          "Operation cancelled. Your private key was not exported.\n\n" +
          `🚀 *Ready to start earning ${apy}% APY anyway?*\n` +
          "You can always export your key later from settings.",
          {
            reply_markup: keyboard,
          }
        );
      }
      return;
    }

    const userId = ctx.session.userId;

    if (!userId) {
      await ctx.reply("❌ Session expired. Please use /start to begin again.");
      return;
    }

    // Check if user has a Coinbase Smart Wallet first
    const { hasCoinbaseSmartWallet, getCoinbaseSmartWallet } = await import("../lib/coinbase-wallet");
    
    let privateKey: string;
    let walletAddress: string;
    let isSmartWallet = false;
    
    if (hasCoinbaseSmartWallet(userId)) {
      // User has a Coinbase Smart Wallet - CRITICAL SECURITY CHECK
      const { checkAllUSDCBalances } = await import("../lib/coinbase-wallet");
      
      // FINAL BALANCE VERIFICATION before showing private key
      console.log(`🔒 FINAL SECURITY CHECK - Verifying Smart Wallet balance before private key export for user ${userId}`);
      const finalBalanceCheck = await checkAllUSDCBalances(userId);
      
      if (!finalBalanceCheck) {
        await ctx.reply("❌ Unable to verify wallet balance. Private key export blocked for security.");
        return;
      }
      
      const finalSmartWalletBalance = parseFloat(finalBalanceCheck.smartWalletBalance);
      const finalEoaBalance = parseFloat(finalBalanceCheck.eoaBalance);
      console.log(`🔍 Final balance check: Smart = $${finalSmartWalletBalance}, EOA = $${finalEoaBalance}`);
      
      if (finalSmartWalletBalance > 0.01) {
        // BLOCK EXPORT - Smart Wallet still has funds
        console.log(`🚫 PRIVATE KEY EXPORT BLOCKED - Smart Wallet still has $${finalSmartWalletBalance}`);
        
        const keyboard = new InlineKeyboard()
          .text("🔄 Transfer Remaining Funds", "confirm_fund_migration");
          
        await ctx.reply(
          `🚫 *PRIVATE KEY EXPORT BLOCKED*\n\n` +
          `**Transfer Incomplete**: Your Smart Wallet still contains ${finalBalanceCheck.smartWalletBalance} USDC.\n\n` +
          `📊 *Current Locations:*\n` +
          `• 🦑 **Smart Wallet**: ${finalBalanceCheck.smartWalletBalance} USDC ← Still has funds\n` +
          `• 🔑 **Regular Wallet**: ${finalBalanceCheck.eoaBalance} USDC ← Private key controls this\n\n` +
          `🔒 **Private key export is locked until Smart Wallet balance is below $0.01**\n\n` +
          `Please complete the transfer of remaining Smart Wallet funds to Regular Wallet.`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
        
        ctx.session.currentAction = "mandatory_fund_migration";
        return;
      }
      
      console.log(`✅ FINAL SECURITY CHECK PASSED - Smart Wallet: $${finalSmartWalletBalance} - PRIVATE KEY EXPORT APPROVED`);
      
      const smartWallet = await getCoinbaseSmartWallet(userId);
      if (!smartWallet) {
        await ctx.reply("❌ Smart wallet not found. Please try again later.");
        return;
      }
      
      // Get the private key from the encrypted wallet data
      const { decrypt } = await import("../lib/encryption");
      privateKey = decrypt(smartWallet.walletData.encryptedPrivateKey);
      walletAddress = smartWallet.owner.address; // EOA address that the private key controls
      isSmartWallet = true;
    } else {
      // User has a traditional wallet
      const wallet = await getWallet(userId);

      if (!wallet) {
        await ctx.reply(
          "❌ Wallet not found. Please create or import a wallet first."
        );
        return;
      }

      // Extract private key for traditional wallet
      privateKey = getPrivateKey(wallet);
      walletAddress = wallet.address;
    }

    // Send private key with appropriate explanation
    await ctx.reply(
      "🔑 *Your Private Key*\n\n" + 
      `\`${privateKey}\`\n\n` +
      (isSmartWallet ? `*Import this key into your favorite wallet (MetaMask, etc.) to access your funds.*` : "*Import this key into your favorite wallet to access your funds.*"),
      {
        parse_mode: "Markdown",
      }
    );

    // Send follow-up reminder about security with action buttons
    // Check if user is in onboarding state
    const { getUserByTelegramId } = await import("../lib/database");
    const user = getUserByTelegramId(userId || "");
    
    if (user && user.onboardingCompleted === null) {
      // Get current Compound V3 APY
      const { getCompoundV3APY } = await import("../lib/defillama-api");
      const apy = await getCompoundV3APY();
      
      // User is still in onboarding - show clean deposit message with manual check
      const keyboard = new InlineKeyboard()
        .text("🔍 Check for Deposit", "manual_balance_check");

      await ctx.reply(
        "✅ *Private key exported successfully!*\n\n" +
          "🔐 Save your keys securely - you can restore your wallet anytime.\n\n" +
          `💰 *Now deposit USDC to start earning up to ${apy}% APY*\n\n` +
          "I'm monitoring your address and will auto-deploy your funds to the best yield opportunity as soon as they arrive!",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } else {
      // Get current highest APY
      const { getHighestAPY } = await import("../lib/defillama-api");
      const apy = await getHighestAPY();
      
      // User has completed onboarding - show deposit-focused menu
      const keyboard = new InlineKeyboard()
        .text("📥 Deposit USDC", "deposit")
        .text("💰 Check Balance", "check_balance")
        .row()
        .text("🚀 Auto-Deploy", "zap_auto_deploy");

      await ctx.reply(
        "🔐 *Keep your key safe:*\n\n" +
          "• Save in password manager\n" +
          "• Never share with anyone\n" +
          "• Delete this chat\n\n" +
          `💰 *Ready to deposit and start earning ${apy}% APY?*`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    }

    // Reset current action
    ctx.session.currentAction = undefined;
  } catch (error) {
    console.error("Error handling export confirmation:", error);
    await ctx.reply(
      "❌ An error occurred while exporting your private key. Please try again later."
    );
  }
}

/**
 * Handles the mandatory migration of funds from a smart wallet to the user's EOA (Externally Owned Account)
 * before a private key export is allowed. This is a critical safety feature to prevent fund loss.
 * @param {BotContext} ctx - The bot context.
 * @param {boolean} [migrate=true] - A flag to proceed with migration, which is always true as this is a mandatory flow.
 * @returns {Promise<void>}
 */
export async function handleFundMigration(
  ctx: BotContext,
  migrate: boolean = true // Always true since migration is mandatory
): Promise<void> {
  try {
    const userId = ctx.session.userId;

    if (!userId) {
      await ctx.reply("❌ Session expired. Please use /start to begin again.");
      return;
    }

    // Remove the confirmation keyboard
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });

    // MANDATORY fund migration - no skip option allowed
    await ctx.reply("🔄 *Moving your funds...*\n\nThis may take a moment.");

    try {
      // Get Smart Wallet balances
      const { checkAllUSDCBalances, transferUsdcGasless } = await import("../lib/coinbase-wallet");
      const balances = await checkAllUSDCBalances(userId);

      if (!balances) {
        throw new Error("Unable to check wallet balances");
      }

      const smartWalletBalance = parseFloat(balances.smartWalletBalance);

      if (smartWalletBalance <= 0.01) {
        await ctx.reply("✅ No significant funds found in Smart Wallet. Proceeding with export...");
        
        // Proceed to export
        ctx.session.currentAction = "export_wallet";
        await handleExportConfirmation(ctx, true);
        return;
      }

      // Transfer funds from Smart Wallet to EOA
      const transferAmount = (smartWalletBalance - 0.01).toFixed(2); // Leave small amount for gas
      
      console.log(`🔄 Migrating ${transferAmount} USDC from Smart Wallet to EOA for user ${userId}`);
      
      const result = await transferUsdcGasless(userId, balances.eoaAddress, transferAmount);

      if (result.success) {
        await ctx.reply(
          `✅ *Transfer completed!*\n\n` +
          `Moved ${transferAmount} USDC successfully.\n\n` +
          `🔓 *Unlocking private key export...*`,
          {
            parse_mode: "Markdown",
          }
        );

        // Wait for transaction to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // CRITICAL: Re-verify Smart Wallet balance before allowing export
        console.log(`🔍 Post-transfer balance verification for user ${userId}`);
        const postTransferBalances = await checkAllUSDCBalances(userId);
        
        if (!postTransferBalances) {
          throw new Error("Unable to verify balance after transfer");
        }
        
        const remainingBalance = parseFloat(postTransferBalances.smartWalletBalance);
        console.log(`💰 Post-transfer Smart Wallet balance: $${remainingBalance}`);
        
        if (remainingBalance > 0.01) {
          // BLOCK export - funds still remain
          console.log(`🚫 EXPORT STILL BLOCKED - Remaining balance: $${remainingBalance}`);
          
          const keyboard = new InlineKeyboard()
            .text("🔄 Try Transfer Again", "confirm_fund_migration");
            
          await ctx.reply(
            `⚠️ *EXPORT STILL BLOCKED*\n\n` +
            `Your Smart Wallet still contains ${postTransferBalances.smartWalletBalance} USDC after the transfer.\n\n` +
            `🚫 **Private key export remains locked until Smart Wallet balance is below $0.01**\n\n` +
            `This may happen if:\n` +
            `• The transfer was partial due to gas reserves\n` +
            `• You received new funds during transfer\n` +
            `• Network delays in processing\n\n` +
            `Please try transferring the remaining funds.`,
            {
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
          return;
        }

        // Balance verified - safe to proceed with export
        console.log(`✅ Balance verified - Smart Wallet: $${remainingBalance} - EXPORT UNLOCKED`);
        await ctx.reply(
          `🔓 *Export Unlocked!*\n\n` +
          `💰 Total: **${postTransferBalances.totalBalance} USDC**\n\n` +
          `Your private key will now control all your funds.`
        );

        // Proceed to export
        ctx.session.currentAction = "export_wallet";
        await handleExportConfirmation(ctx, true);

      } else {
        // Transfer failed - BLOCK export and require retry
        console.log(`🚫 Transfer failed for user ${userId}: ${result.error}`);
        
        const keyboard = new InlineKeyboard()
          .text("🔄 Retry Transfer", "confirm_fund_migration")
          .row()
          .text("❓ Get Help", "transfer_help");
          
        await ctx.reply(
          `❌ *FUND TRANSFER FAILED*\n\n` +
          `Error: ${result.error}\n\n` +
          `🚫 **Private key export remains locked until your Smart Wallet funds are successfully transferred.**\n\n` +
          `Your Smart Wallet still contains ${balances.smartWalletBalance} USDC that won't be accessible with just your private key.\n\n` +
          `Please retry the gasless transfer to unlock private key export.`,
          {
            parse_mode: "Markdown",
            reply_markup: keyboard,
          }
        );
        
        // Keep session in migration mode - do NOT proceed to export
        ctx.session.currentAction = "mandatory_fund_migration";
      }

    } catch (migrationError: any) {
      console.error("Fund migration failed:", migrationError);
      
      const keyboard = new InlineKeyboard()
        .text("🔄 Retry Transfer", "confirm_fund_migration")
        .row()
        .text("❓ Get Help", "transfer_help");
      
      await ctx.reply(
        `❌ *FUND TRANSFER ERROR*\n\n` +
        `Error: ${migrationError.message}\n\n` +
        `🚫 **Private key export remains locked until your Smart Wallet funds are successfully transferred.**\n\n` +
        `Your Smart Wallet funds won't be accessible with just your private key.\n\n` +
        `Please retry the gasless transfer to unlock private key export.`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
      
      // Keep session in migration mode - do NOT proceed to export
      ctx.session.currentAction = "mandatory_fund_migration";
    }

  } catch (error) {
    console.error("Error handling fund migration:", error);
    await ctx.reply(
      "❌ An error occurred during fund migration. Please try again later."
    );
    ctx.session.currentAction = undefined;
  }
}
