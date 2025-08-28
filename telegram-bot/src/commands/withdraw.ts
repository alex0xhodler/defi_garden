import { BotContext } from "../context";
import { getWallet } from "../lib/token-wallet";
import { withdrawFromAave, withdrawFromFluid } from "../lib/defi-protocols";
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

      // Show exit pool options
      const keyboard = new InlineKeyboard()
        .text("🌊 Exit All from Fluid", "withdraw_fluid_max")
        .text("🏛️ Exit All from Aave", "withdraw_aave_max").row()
        .text("🚪 Exit Custom Amount", "withdraw_custom").row()
        .text("❌ Cancel", "cancel_operation");

      await ctx.reply(
        `🚪 **Exit DeFi Pools**\n\n` +
          `**Options:**\n` +
          `• **Exit Fluid** - Get all your USDC back from Fluid to wallet\n` +
          `• **Exit Aave** - Get all your USDC back from Aave to wallet\n` +
          `• **Exit Custom** - Specify exact amount and protocol to exit\n\n` +
          `**Note:** Small gas fee (~$0.002) required for pool exit`,
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
        const receipt = await withdrawFromFluid(wallet, "max");

        const successKeyboard = new InlineKeyboard()
          .text("🚀 Reinvest", "zap_funds")
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
        const receipt = await withdrawFromAave(wallet, "max");

        const successKeyboard = new InlineKeyboard()
          .text("🚀 Reinvest", "zap_funds")
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

    const processingMsg = await ctx.reply(
      `🔄 **Processing Withdrawal...**\n\n` +
        `**Protocol:** Aave V3\n` +
        `**Amount:** ${amount === "max" ? "All available" : amount} USDC\n` +
        `**Status:** Executing transaction...`,
      {
        parse_mode: "Markdown"
      }
    );

    try {
      const claimRewards = ctx.session.tempData?.claimRewards;
      const isMaxWithdrawal = amount.toLowerCase() === "max";
      const receipt = await withdrawFromAave(wallet, amount, claimRewards);

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
        .text("🚀 Reinvest", "zap_funds")
        .text("📊 View Portfolio", "view_portfolio")
        .row()
        .text("💰 Check Balance", "check_balance")
        .text("📥 Deposit More", "deposit");

      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `✅ **Withdrawal Successful!**\n\n` +
          `**Protocol:** Aave V3\n` +
          `**Amount:** ${isMaxWithdrawal ? "All available" : amount} USDC\n` +
          `**Rewards:** ${rewardStatus}\n` +
          `**Transaction:** \`${receipt.transactionHash}\`\n` +
          `**Block:** ${receipt.blockNumber}\n` +
          `**Gas Used:** ${receipt.gasUsed}\n\n` +
          `💰 USDC has been withdrawn to your wallet!\n` +
          `🔍 [View on Basescan](https://basescan.org/tx/${receipt.transactionHash})`,
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
      
      const errorKeyboard = new InlineKeyboard()
        .text("🔄 Try Again", "withdraw_custom")
        .text("💸 Withdraw All", "withdraw_aave_max")
        .row()
        .text("📊 View Portfolio", "view_portfolio")
        .text("💰 Check Balance", "check_balance");

      await ctx.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `❌ **Withdrawal Failed**\n\n` +
          `**Error:** ${error.message}\n\n` +
          `This might be due to:\n` +
          `• Insufficient ETH for gas fees\n` +
          `• No USDC deposited in Aave\n` +
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