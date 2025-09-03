import { BotContext } from "../context";
import { getWallet } from "../lib/token-wallet";
import { withdrawFromAave, withdrawFromFluid, withdrawFromCompound } from "../lib/defi-protocols";
import { withdrawFromCompoundV3, gaslessWithdrawFromAave, gaslessWithdrawFromFluid } from "../services/coinbase-defi";
import { getCoinbaseSmartWallet, hasCoinbaseSmartWallet } from "../lib/coinbase-wallet";
import { CommandHandler } from "../types/commands";
import { InlineKeyboard } from "grammy";

const withdrawHandler: CommandHandler = {
  command: "withdraw",
  description: "Exit DeFi pools and get USDC back to wallet",
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
        const keyboard = new InlineKeyboard()
          .text("Create Wallet", "create_wallet")
          .text("Import Wallet", "import_wallet");

        await ctx.reply(
          "❌ You don't have a wallet yet.\n\n" +
            "You need to create or import a wallet first:",
          { reply_markup: keyboard }
        );
        return;
      }

      // Show protocol selection for exit
      const keyboard = new InlineKeyboard()
        .text("🌊 Exit from Fluid", "withdraw_fluid_menu").row()
        .text("🏛️ Exit from Aave", "withdraw_aave_menu").row()
        .text("🏦 Exit from Compound", "withdraw_compound_menu").row()
        .text("❌ Cancel", "cancel_operation");

      await ctx.reply(
        `🚪 **Exit DeFi Pools**\n\n` +
          `Choose which protocol to exit from:\n\n` +
          `**🌊 Fluid Finance**\n` +
          `• Higher APY protocol (7.8%)\n` +
          `• Full or partial withdrawal options\n\n` +
          `**🏛️ Aave V3**\n` +
          `• Stable lending protocol (5.2%)\n` +
          `• Full or partial withdrawal options\n\n` +
          `**🏦 Compound V3**\n` +
          `• USDC lending with COMP rewards\n` +
          `• Full or partial withdrawal options\n\n` +
          `**Note:** Small gas fee (~$0.002) required for each exit`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error("Error in withdraw command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  },
};

// Handle withdrawal callbacks
export const handleWithdrawCallbacks = async (ctx: BotContext) => {
  const callbackData = ctx.callbackQuery?.data;

  if (!callbackData) return;

  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.answerCallbackQuery("Please start the bot first with /start");
      return;
    }

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.answerCallbackQuery("No wallet found. Create one first.");
      return;
    }

    // Handle protocol menu selection
    if (callbackData === "withdraw_fluid_menu") {
      await ctx.answerCallbackQuery();
      
      const keyboard = new InlineKeyboard()
        .text("💸 Exit All Fluid", "withdraw_fluid_max").row()
        .text("⚖️ Exit Custom Amount", "withdraw_fluid_custom").row()
        .text("🔙 Back", "withdraw");

      await ctx.reply(
        `🌊 **Exit from Fluid Finance**\n\n` +
          `**Your Fluid Position:**\n` +
          `• Current APY: 7.8%\n` +
          `• Token: fUSDC (interest-bearing)\n` +
          `• Rewards: Auto-compounding\n\n` +
          `**Exit Options:**\n` +
          `• **Exit All** - Withdraw complete Fluid position to wallet\n` +
          `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
          `**Note:** Rewards are automatically claimed on withdrawal`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      return;
    }

    if (callbackData === "withdraw_aave_menu") {
      await ctx.answerCallbackQuery();
      
      const keyboard = new InlineKeyboard()
        .text("💸 Exit All Aave", "withdraw_aave_max").row()
        .text("⚖️ Exit Custom Amount", "withdraw_aave_custom").row()
        .text("🔙 Back", "withdraw");

      await ctx.reply(
        `🏛️ **Exit from Aave V3**\n\n` +
          `**Your Aave Position:**\n` +
          `• Current APY: 5.2%\n` +
          `• Token: aUSDC (interest-bearing)\n` +
          `• Rewards: Auto-compounding\n\n` +
          `**Exit Options:**\n` +
          `• **Exit All** - Withdraw complete Aave position to wallet\n` +
          `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
          `**Note:** Rewards are automatically claimed on full withdrawal`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      return;
    }

    if (callbackData === "withdraw_compound_menu") {
      await ctx.answerCallbackQuery();
      
      const keyboard = new InlineKeyboard()
        .text("💸 Exit All Compound", "withdraw_compound_max").row()
        .text("⚖️ Exit Custom Amount", "withdraw_compound_custom").row()
        .text("🔙 Back", "withdraw");

      await ctx.reply(
        `🏦 **Exit from Compound V3**\n\n` +
          `**Your Compound Position:**\n` +
          `• Current APY: 6.2%\n` +
          `• Token: cUSDCv3 (interest-bearing)\n` +
          `• Rewards: COMP tokens\n\n` +
          `**Exit Options:**\n` +
          `• **Exit All** - Withdraw complete Compound position to wallet\n` +
          `• **Custom Amount** - Specify exact USDC amount to exit\n\n` +
          `**Note:** COMP rewards are claimed automatically on withdrawal`,
        {
          parse_mode: "Markdown",
          reply_markup: keyboard
        }
      );
      return;
    }

    if (callbackData === "withdraw_fluid_max") {
      await ctx.answerCallbackQuery();
      
      const processingMsg = await ctx.reply(
        `🔄 **Processing Pool Exit...**\n\n` +
          `**Protocol:** Fluid Finance\n` +
          `**Amount:** All available USDC\n` +
          `**Status:** Executing transaction...`,
        {
          parse_mode: "Markdown"
        }
      );

      try {
        const userId = ctx.from?.id?.toString();
        const hasSmartWallet = userId ? hasCoinbaseSmartWallet(userId) : false;
        
        let receipt;
        if (hasSmartWallet) {
          console.log(`🦑 Using gasless Fluid withdrawal for Smart Wallet user`);
          const result = await gaslessWithdrawFromFluid(userId!, "max");
          if (!result.success) {
            throw new Error(result.error);
          }
          // Simulate receipt format for consistency
          receipt = {
            transactionHash: result.txHash,
            blockNumber: "N/A (CDP UserOp)",
            gasUsed: "Sponsored by inkvest"
          };
        } else {
          console.log(`📤 Using regular Fluid withdrawal (no Smart Wallet)`);
          receipt = await withdrawFromFluid(wallet, "max");
        }

        const successKeyboard = new InlineKeyboard()
          .text("🚀 Earn More", "zap_funds")
          .text("📊 View Portfolio", "view_portfolio")
          .row()
          .text("💰 Check Balance", "check_balance")
          .text("📥 Deposit More", "deposit");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `✅ **Pool Exit Successful!**\n\n` +
            `**Protocol:** Fluid Finance\n` +
            `**Amount:** All available USDC\n` +
            `**Transaction:** \`${receipt.transactionHash}\`\n` +
            `**Block:** ${receipt.blockNumber}\n` +
            `**Gas Used:** ${receipt.gasUsed}\n\n` +
            `💰 USDC has been moved back to your wallet!\n` +
            `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`,
          {
            parse_mode: "Markdown",
            reply_markup: successKeyboard
          }
        );

      } catch (error: any) {
        console.error("Fluid withdrawal failed:", error);
        
        const errorKeyboard = new InlineKeyboard()
          .text("🔄 Try Again", "withdraw_fluid_max")
          .text("🏛️ Exit Aave Instead", "withdraw_aave_max")
          .row()
          .text("📊 View Portfolio", "view_portfolio")
          .text("💰 Check Balance", "check_balance");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `❌ **Pool Exit Failed**\n\n` +
            `**Error:** ${error.message}\n\n` +
            `This might be due to:\n` +
            `• Insufficient ETH for gas fees\n` +
            `• No USDC deposited in Fluid\n` +
            `• Network issues\n\n` +
            `Try checking your balance with /portfolio`,
          {
            parse_mode: "Markdown",
            reply_markup: errorKeyboard
          }
        );
      }
    }

    if (callbackData === "withdraw_aave_max") {
      await ctx.answerCallbackQuery();
      
      const processingMsg = await ctx.reply(
        `🔄 **Processing Pool Exit...**\n\n` +
          `**Protocol:** Aave V3\n` +
          `**Amount:** All available USDC\n` +
          `**Status:** Executing transaction...`,
        {
          parse_mode: "Markdown"
        }
      );

      try {
        const userId = ctx.from?.id?.toString();
        const hasSmartWallet = userId ? hasCoinbaseSmartWallet(userId) : false;
        
        let receipt;
        if (hasSmartWallet) {
          console.log(`🦑 Using gasless Aave withdrawal for Smart Wallet user`);
          const result = await gaslessWithdrawFromAave(userId!, "max");
          if (!result.success) {
            throw new Error(result.error);
          }
          // Simulate receipt format for consistency
          receipt = {
            transactionHash: result.txHash,
            blockNumber: "N/A (CDP UserOp)",
            gasUsed: "Sponsored by inkvest"
          };
        } else {
          console.log(`📤 Using regular Aave withdrawal (no Smart Wallet)`);
          receipt = await withdrawFromAave(wallet, "max");
        }

        const successKeyboard = new InlineKeyboard()
          .text("🚀 Earn More", "zap_funds")
          .text("📊 View Portfolio", "view_portfolio")
          .row()
          .text("💰 Check Balance", "check_balance")
          .text("📥 Deposit More", "deposit");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `✅ **Pool Exit Successful!**\n\n` +
            `**Protocol:** Aave V3\n` +
            `**Amount:** All available USDC\n` +
            `**Transaction:** \`${receipt.transactionHash}\`\n` +
            `**Block:** ${receipt.blockNumber}\n` +
            `**Gas Used:** ${receipt.gasUsed}\n\n` +
            `💰 USDC has been moved back to your wallet!\n` +
            `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`,
          {
            parse_mode: "Markdown",
            reply_markup: successKeyboard
          }
        );

      } catch (error: any) {
        console.error("Withdrawal failed:", error);
        
        const errorKeyboard = new InlineKeyboard()
          .text("🔄 Try Again", "withdraw_aave_max")
          .text("💸 Custom Amount", "withdraw_custom")
          .row()
          .text("📊 View Portfolio", "view_portfolio")
          .text("💰 Check Balance", "check_balance");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `❌ **Pool Exit Failed**\n\n` +
            `**Error:** ${error.message}\n\n` +
            `This might be due to:\n` +
            `• Insufficient ETH for gas fees\n` +
            `• No USDC deposited in Aave\n` +
            `• Network issues\n\n` +
            `Try checking your balance with /portfolio`,
          {
            parse_mode: "Markdown",
            reply_markup: errorKeyboard
          }
        );
      }
    }

    if (callbackData === "withdraw_compound_max") {
      await ctx.answerCallbackQuery();
      
      const processingMsg = await ctx.reply(
        `🔄 **Processing Pool Exit...**\n\n` +
          `**Protocol:** Compound V3\n` +
          `**Amount:** All available USDC\n` +
          `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
          `**Status:** Executing transaction...`,
        {
          parse_mode: "Markdown"
        }
      );

      try {
        // Get user's Compound V3 balance to withdraw max amount
        const { getCompoundV3Balance } = await import("../services/coinbase-defi");
        const smartWallet = await getCoinbaseSmartWallet(userId);
        if (!smartWallet) {
          throw new Error("Smart wallet not found");
        }
        
        const compoundBalance = await getCompoundV3Balance(smartWallet.smartAccount.address);
        const result = await withdrawFromCompoundV3(userId, compoundBalance);

        if (!result.success) {
          throw new Error(result.error);
        }

        const successKeyboard = new InlineKeyboard()
          .text("🚀 Earn More", "zap_funds")
          .text("📊 View Portfolio", "view_portfolio")
          .row()
          .text("💰 Check Balance", "check_balance")
          .text("📥 Deposit More", "deposit");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `✅ **Pool Exit Successful!**\n\n` +
            `**Protocol:** Compound V3\n` +
            `**Amount:** All available USDC\n` +
            `**Gas:** Sponsored by inkvest (gasless!)\n` +
            `**Transaction:** \`${result.txHash}\`\n\n` +
            `💰 USDC has been moved back to your Smart Wallet!\n` +
            `🔍 [View on Basescan](https://basescan.org/tx/${result.txHash})`,
          {
            parse_mode: "Markdown",
            reply_markup: successKeyboard
          }
        );

      } catch (error: any) {
        console.error("Compound withdrawal failed:", error);
        
        const errorKeyboard = new InlineKeyboard()
          .text("🔄 Try Again", "withdraw_compound_max")
          .text("💸 Custom Amount", "withdraw_compound_custom")
          .row()
          .text("📊 View Portfolio", "view_portfolio")
          .text("💰 Check Balance", "check_balance");

        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `❌ **Pool Exit Failed**\n\n` +
            `**Error:** ${error.message}\n\n` +
            `This might be due to:\n` +
            `• Insufficient ETH for gas fees\n` +
            `• No USDC deposited in Compound\n` +
            `• Network issues\n\n` +
            `Try checking your balance with /portfolio`,
          {
            parse_mode: "Markdown",
            reply_markup: errorKeyboard
          }
        );
      }
    }

    if (callbackData === "withdraw_compound_custom") {
      await ctx.answerCallbackQuery();
      
      // Store protocol preference and set state for amount input
      ctx.session.tempData = ctx.session.tempData || {};
      ctx.session.tempData.protocol = "compound";
      ctx.session.awaitingWithdrawAmount = true;
      
      await ctx.reply(
        `💸 **Custom Compound Withdrawal**\n\n` +
          `Please enter the amount of USDC you want to withdraw:\n\n` +
          `**Examples:**\n` +
          `• \`1\` - Withdraw 1 USDC\n` +
          `• \`50.5\` - Withdraw 50.5 USDC\n` +
          `• \`max\` - Withdraw all available\n\n` +
          `**Note:** COMP rewards are automatically claimed\n\n` +
          `**Cancel:** Send /cancel`,
        {
          parse_mode: "Markdown"
        }
      );
      return;
    }

    // Handle protocol-specific custom withdrawals
    if (callbackData === "withdraw_fluid_custom") {
      await ctx.answerCallbackQuery();
      
      // Store protocol preference and set state for amount input
      ctx.session.tempData = ctx.session.tempData || {};
      ctx.session.tempData.protocol = "fluid";
      ctx.session.tempData.claimRewards = true; // Fluid always claims rewards
      ctx.session.awaitingWithdrawAmount = true;
      
      await ctx.reply(
        `💸 **Custom Fluid Withdrawal**\n\n` +
          `Please enter the amount of USDC you want to withdraw from Fluid:\n\n` +
          `**Examples:**\n` +
          `• \`1\` - Withdraw 1 USDC\n` +
          `• \`50.5\` - Withdraw 50.5 USDC\n` +
          `• \`max\` - Withdraw all available\n\n` +
          `**Protocol:** Fluid Finance (7.8% APY)\n` +
          `**Rewards:** Will be automatically claimed\n\n` +
          `**Cancel:** Send /cancel`,
        {
          parse_mode: "Markdown"
        }
      );
      return;
    }

    if (callbackData === "withdraw_aave_custom") {
      await ctx.answerCallbackQuery();
      
      // Show reward options for Aave custom withdrawal
      const rewardKeyboard = new InlineKeyboard()
        .text("🚪 Exit + Claim Rewards", "withdraw_aave_custom_with_rewards").row()
        .text("🚪 Exit Only", "withdraw_aave_custom_no_rewards").row()
        .text("🔙 Back", "withdraw_aave_menu");
      
      await ctx.reply(
        `🏛️ **Aave Custom Exit Options**\n\n` +
          `**Choose your exit preference:**\n` +
          `• **With Rewards** - Claim any earned rewards before exit\n` +
          `• **Without Rewards** - Just exit principal, leave rewards in pool\n\n` +
          `**Note:** Rewards are automatically claimed for full exits`,
        {
          parse_mode: "Markdown",
          reply_markup: rewardKeyboard,
        }
      );
      return;
    }

    if (callbackData === "withdraw_aave_custom_with_rewards" || callbackData === "withdraw_aave_custom_no_rewards") {
      await ctx.answerCallbackQuery();
      
      // Store protocol and reward preference, set state for amount input
      ctx.session.tempData = ctx.session.tempData || {};
      ctx.session.tempData.protocol = "aave";
      ctx.session.tempData.claimRewards = callbackData === "withdraw_aave_custom_with_rewards";
      ctx.session.awaitingWithdrawAmount = true;
      
      await ctx.reply(
        `💸 **Custom Aave Withdrawal**\n\n` +
          `Please enter the amount of USDC you want to withdraw from Aave:\n\n` +
          `**Examples:**\n` +
          `• \`1\` - Withdraw 1 USDC\n` +
          `• \`50.5\` - Withdraw 50.5 USDC\n` +
          `• \`max\` - Withdraw all available\n\n` +
          `**Protocol:** Aave V3 (5.2% APY)\n` +
          `**Rewards:** ${ctx.session.tempData.claimRewards ? "Will be claimed" : "Will be left in pool"}\n\n` +
          `**Cancel:** Send /cancel`,
        {
          parse_mode: "Markdown"
        }
      );
      return;
    }

    // Legacy support - redirect old custom to Aave
    if (callbackData === "withdraw_custom") {
      await ctx.answerCallbackQuery();
      
      // Show reward options for custom withdrawal
      const rewardKeyboard = new InlineKeyboard()
        .text("🚪 Exit + Claim Rewards", "withdraw_custom_with_rewards").row()
        .text("🚪 Exit Only", "withdraw_custom_no_rewards").row()
        .text("❌ Cancel", "cancel_operation");
      
      await ctx.reply(
        `🚪 **Custom Pool Exit Options**\n\n` +
          `**Choose your exit preference:**\n` +
          `• **With Rewards** - Claim any earned rewards before exit\n` +
          `• **Without Rewards** - Just exit principal, leave rewards in pool\n\n` +
          `**Note:** Rewards are automatically claimed for full exits`,
        {
          parse_mode: "Markdown",
          reply_markup: rewardKeyboard,
        }
      );
    }

    if (callbackData === "withdraw_custom_with_rewards" || callbackData === "withdraw_custom_no_rewards") {
      await ctx.answerCallbackQuery();
      
      // Store reward preference and set state for amount input
      ctx.session.tempData = ctx.session.tempData || {};
      ctx.session.tempData.claimRewards = callbackData === "withdraw_custom_with_rewards";
      ctx.session.awaitingWithdrawAmount = true;
      
      await ctx.reply(
        `💸 **Custom Withdrawal Amount**\n\n` +
          `Please enter the amount of USDC you want to withdraw from Aave:\n\n` +
          `**Examples:**\n` +
          `• \`1\` - Withdraw 1 USDC\n` +
          `• \`50.5\` - Withdraw 50.5 USDC\n` +
          `• \`max\` - Withdraw all available\n\n` +
          `**Rewards:** ${ctx.session.tempData.claimRewards ? "Will be claimed" : "Will be left in pool"}\n\n` +
          `**Cancel:** Send /cancel`,
        {
          parse_mode: "Markdown"
        }
      );
    }

  } catch (error) {
    console.error("Error handling withdrawal callback:", error);
    await ctx.answerCallbackQuery("❌ An error occurred. Please try again.");
  }
};

// Handle custom withdrawal amount input
export const handleWithdrawAmountInput = async (ctx: BotContext, amount: string) => {
  try {
    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply("❌ Please start the bot first with /start command.");
      return;
    }

    const wallet = await getWallet(userId);
    if (!wallet) {
      await ctx.reply("❌ No wallet found. Create one first.");
      return;
    }

    // Validate amount
    if (amount.toLowerCase() !== "max" && (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0)) {
      await ctx.reply("❌ Please enter a valid amount (positive number) or `max`", {
        parse_mode: "Markdown"
      });
      return;
    }

    // Determine which protocol to withdraw from
    const protocol = ctx.session.tempData?.protocol || "aave"; // Default to Aave for legacy support
    const protocolName = protocol === "fluid" ? "Fluid Finance" : protocol === "compound" ? "Compound V3" : "Aave V3";
    const protocolEmoji = protocol === "fluid" ? "🌊" : protocol === "compound" ? "🏦" : "🏛️";

    const processingMsg = await ctx.reply(
      `🔄 **Processing Withdrawal...**\n\n` +
        `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
        `**Amount:** ${amount === "max" ? "All available" : amount} USDC\n` +
        `**Status:** Executing transaction...`,
      {
        parse_mode: "Markdown"
      }
    );

    try {
      const claimRewards = ctx.session.tempData?.claimRewards;
      const isMaxWithdrawal = amount.toLowerCase() === "max";
      
      // Execute withdrawal based on protocol
      const hasSmartWallet = hasCoinbaseSmartWallet(userId);
      let receipt: any;
      
      if (protocol === "fluid") {
        if (hasSmartWallet) {
          console.log(`🦑 Using gasless Fluid withdrawal for Smart Wallet user`);
          const result = await gaslessWithdrawFromFluid(userId, amount);
          if (!result.success) {
            throw new Error(result.error);
          }
          receipt = {
            transactionHash: result.txHash,
            blockNumber: "N/A (CDP UserOp)",
            gasUsed: "Sponsored by inkvest"
          };
        } else {
          console.log(`📤 Using regular Fluid withdrawal (no Smart Wallet)`);
          receipt = await withdrawFromFluid(wallet, amount, claimRewards);
        }
      } else if (protocol === "compound") {
        // Use CDP gasless withdrawal for Compound V3
        const result = await withdrawFromCompoundV3(userId, amount);
        if (!result.success) {
          throw new Error(result.error);
        }
        // Simulate receipt format for consistency with other protocols
        receipt = {
          transactionHash: result.txHash,
          blockNumber: "N/A (CDP UserOp)",
          gasUsed: "Sponsored by inkvest"
        };
      } else {
        if (hasSmartWallet) {
          console.log(`🦑 Using gasless Aave withdrawal for Smart Wallet user`);
          const result = await gaslessWithdrawFromAave(userId, amount);
          if (!result.success) {
            throw new Error(result.error);
          }
          receipt = {
            transactionHash: result.txHash,
            blockNumber: "N/A (CDP UserOp)",
            gasUsed: "Sponsored by inkvest"
          };
        } else {
          console.log(`📤 Using regular Aave withdrawal (no Smart Wallet)`);
          receipt = await withdrawFromAave(wallet, amount, claimRewards);
        }
      }

      // Determine reward status based on actual behavior
      let rewardStatus: string;
      if (isMaxWithdrawal) {
        rewardStatus = "Claimed (automatic for full withdrawal)";
      } else if (claimRewards === true) {
        rewardStatus = "Claimed";
      } else if (claimRewards === false) {
        rewardStatus = "Left in pool";
      } else {
        // Default for partial withdrawals when not explicitly set
        rewardStatus = "Left in pool (default)";
      }

      const successKeyboard = new InlineKeyboard()
        .text("🚀 Earn More", "zap_funds")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("💰 Check Balance", "check_balance")
        .text("📥 Deposit More", "deposit");

      // Build success message based on protocol
      let successMessage = `✅ **Withdrawal Successful!**\n\n` +
        `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
        `**Amount:** ${isMaxWithdrawal ? "All available" : amount} USDC\n`;

      if (protocol === "compound") {
        // CDP gasless withdrawal message
        successMessage += `**Gas:** Sponsored by inkvest (gasless!)\n` +
          `**Transaction:** \`${receipt.transactionHash}\`\n\n` +
          `💰 USDC has been withdrawn to your Smart Wallet!\n`;
      } else {
        // Regular withdrawal message
        successMessage += `**Rewards:** ${rewardStatus}\n` +
          `**Transaction:** \`${receipt.transactionHash}\`\n` +
          `**Block:** ${receipt.blockNumber}\n` +
          `**Gas Used:** ${receipt.gasUsed}\n\n` +
          `💰 USDC has been withdrawn to your wallet!\n`;
      }

      successMessage += `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`;

      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        successMessage,
        {
          parse_mode: "Markdown",
          reply_markup: successKeyboard
        }
      );

      // Clear the awaiting state and temp data
      ctx.session.awaitingWithdrawAmount = false;
      ctx.session.tempData = {};

    } catch (error: any) {
      console.error("Withdrawal failed:", error);
      
      const retryCustomAction = protocol === "fluid" ? "withdraw_fluid_custom" : protocol === "compound" ? "withdraw_compound_custom" : "withdraw_aave_custom";
      const withdrawAllAction = protocol === "fluid" ? "withdraw_fluid_max" : protocol === "compound" ? "withdraw_compound_max" : "withdraw_aave_max";
      const protocolDisplayName = protocol === "fluid" ? "Fluid Finance" : protocol === "compound" ? "Compound" : "Aave";

      const errorKeyboard = new InlineKeyboard()
        .text("🔄 Try Again", retryCustomAction)
        .text(`💸 Exit All ${protocolDisplayName}`, withdrawAllAction)
        .row()
        .text("📊 View Portfolio", "view_portfolio")
        .text("💰 Check Balance", "check_balance");

      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `❌ **Withdrawal Failed**\n\n` +
          `**Protocol:** ${protocolEmoji} ${protocolName}\n` +
          `**Error:** ${error.message}\n\n` +
          `This might be due to:\n` +
          `• Insufficient ETH for gas fees\n` +
          `• No USDC deposited in ${protocolDisplayName}\n` +
          `• Withdrawal amount exceeds deposited balance\n` +
          `• Network issues\n\n` +
          `Try checking your balance with /portfolio`,
        {
          parse_mode: "Markdown",
          reply_markup: errorKeyboard
        }
      );
      
      // Clear the awaiting state and temp data
      ctx.session.awaitingWithdrawAmount = false;
      ctx.session.tempData = {};
    }

  } catch (error) {
    console.error("Error processing withdrawal amount:", error);
    await ctx.reply("❌ An error occurred. Please try again later.");
    ctx.session.awaitingWithdrawAmount = false;
    ctx.session.tempData = {};
  }
};

export default withdrawHandler;