import { InlineKeyboard } from "grammy";
import { BotContext } from "../context";
import { CommandHandler, SettingsOption } from "../types/commands";
import { saveUserSettings } from "../lib/database";
import { ERRORS } from "../utils/constants";

/**
 * Handles the /settings command.
 * It displays the user's current settings for risk level, minimum APY, slippage, and auto-compounding,
 * and provides buttons to change them.
 * @command /settings
 * @description Adjust risk tolerance and preferences.
 */
const settingsHandler: CommandHandler = {
  command: "settings",
  description: "Adjust risk tolerance and preferences",
  handler: async (ctx: BotContext) => {
    try {
      const userId = ctx.session.userId;

      if (!userId) {
        await ctx.reply(ERRORS.NO_WALLET);
        return;
      }

      const settings = ctx.session.settings;
      
      let message = `⚙️ *DeFi Settings*\n\n`;
      message += `Configure your yield farming preferences:\n\n`;
      
      message += `🎯 **Risk Level**: ${settings?.riskLevel || 3}/5\n`;
      message += getRiskDescription(settings?.riskLevel || 3);
      message += `\n\n`;
      
      message += `📈 **Min APY**: ${settings?.minApy || 5}%\n`;
      message += `Only show opportunities above this yield\n\n`;
      
      message += `💱 **Slippage**: ${settings?.slippage || 1}%\n`;
      message += `Maximum price impact tolerance\n\n`;
      
      message += `🔄 **Auto-Compound**: ${settings?.autoCompound ? 'ON' : 'OFF'}\n`;
      message += `Automatically reinvest harvested yields\n\n`;

      const keyboard = new InlineKeyboard()
        .text("🎯 Risk Level", "settings_risk")
        .text("📈 Min APY", "settings_minApy")
        .row()
        .text("💱 Slippage", "settings_slippage") 
        .text("🔄 Auto-Compound", "settings_autoCompound")
        .row()
        .text("🔑 Export Private Key", "settings_export_key")
        .row()
        .text("🔄 Reset to Defaults", "settings_reset")
        .text("✅ Done", "settings_back");

      await ctx.reply(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
      });

    } catch (error) {
      console.error("Error in settings command:", error);
      await ctx.reply(ERRORS.NETWORK_ERROR);
    }
  },
};

/**
 * Returns a user-friendly description for a given risk level.
 * @param {number} riskLevel - The risk level (1-5).
 * @returns {string} The description string.
 */
function getRiskDescription(riskLevel: number): string {
  switch (riskLevel) {
    case 1:
      return "🛡️ Very Safe - Only blue-chip protocols, 50M+ TVL";
    case 2: 
      return "🟢 Conservative - Established protocols, 20M+ TVL";
    case 3:
      return "🟡 Moderate - Good balance of safety and yield";
    case 4:
      return "🟠 Aggressive - Higher yields, some newer protocols";
    case 5:
      return "🔴 Maximum Yield - Highest APY, accept higher risks";
    default:
      return "🟡 Moderate risk level";
  }
}

/**
 * Handles the user's selection from the main settings menu.
 * It routes the user to the appropriate sub-menu for changing risk, slippage, or min APY.
 * @param {BotContext} ctx - The bot context.
 * @param {SettingsOption} option - The settings option selected by the user.
 * @returns {Promise<void>}
 */
export async function handleSettingsOption(
  ctx: BotContext,
  option: SettingsOption
): Promise<void> {
  try {
    console.log(`🔧 Settings option called: "${option}"`);
    const settings = ctx.session.settings;

    console.log(`🔧 Switch statement input: "${option}" (type: ${typeof option})`);
    
    switch (option) {
      case "risk":
        console.log(`✅ Matched case: risk`);
        const riskKeyboard = new InlineKeyboard()
          .text("🛡️ 1 - Very Safe", "risk_1")
          .text("🟢 2 - Conservative", "risk_2")
          .row()
          .text("🟡 3 - Moderate", "risk_3")
          .text("🟠 4 - Aggressive", "risk_4")
          .row()
          .text("🔴 5 - Maximum Yield", "risk_5")
          .row()
          .text("⬅️ Back", "settings_back");

        await ctx.editMessageText(
          `🎯 *Risk Level Selection*\n\n` +
          `Choose your risk tolerance:\n\n` +
          `🛡️ **Level 1**: Only Aave, Compound (3-5% APY)\n` +
          `🟢 **Level 2**: + Yearn, established DeFi (4-8% APY)\n` +
          `🟡 **Level 3**: + Some newer protocols (5-15% APY)\n` +
          `🟠 **Level 4**: Higher yield farming (10-25% APY)\n` +
          `🔴 **Level 5**: Maximum yields, all protocols (15%+ APY)\n\n` +
          `Current: **Level ${settings?.riskLevel || 3}**`,
          {
            parse_mode: "Markdown",
            reply_markup: riskKeyboard
          }
        );
        break;

      case "slippage":
        const slippageKeyboard = new InlineKeyboard()
          .text("0.1%", "slippage_0.1")
          .text("0.5%", "slippage_0.5")
          .text("1%", "slippage_1")
          .row()
          .text("2%", "slippage_2")
          .text("3%", "slippage_3")
          .text("5%", "slippage_5")
          .row()
          .text("⬅️ Back", "settings_back");

        await ctx.editMessageText(
          `💱 *Slippage Tolerance*\n\n` +
          `Maximum price impact you'll accept:\n\n` +
          `• **0.1%**: Very tight, may fail in volatile markets\n` +
          `• **0.5%**: Tight, good for stablecoins\n` +
          `• **1%**: Balanced (recommended)\n` +
          `• **2%**: Flexible, works in most conditions\n` +
          `• **3%+**: High tolerance, use with caution\n\n` +
          `Current: **${settings?.slippage || 1}%**`,
          {
            parse_mode: "Markdown",
            reply_markup: slippageKeyboard
          }
        );
        break;

      case "minApy":
        console.log(`✅ Matched case: minApy`);
        const minApyKeyboard = new InlineKeyboard()
          .text("1%", "minapy_1")
          .text("2%", "minapy_2")
          .text("3%", "minapy_3")
          .row()
          .text("4%", "minapy_4")
          .text("5%", "minapy_5")
          .text("6%", "minapy_6")
          .row()
          .text("7%", "minapy_7")
          .text("8%", "minapy_8")
          .text("10%", "minapy_10")
          .row()
          .text("12%", "minapy_12")
          .text("15%", "minapy_15")
          .row()
          .text("⬅️ Back", "settings_back");

        await ctx.editMessageText(
          `📈 *Minimum APY Threshold*\n\n` +
          `Only show yield opportunities above this APY:\n\n` +
          `• **1-3%**: Ultra-safe protocols only\n` +
          `• **4-6%**: Conservative, established protocols\n` +
          `• **7-8%**: Balanced risk/reward (recommended)\n` +
          `• **10%+**: Higher yields, accept more risk\n` +
          `• **12-15%**: Maximum yield hunting\n\n` +
          `Current: **${settings?.minApy || 5}%**\n\n` +
          `💡 Pools below your threshold won't appear in /earn or /zap commands.`,
          {
            parse_mode: "Markdown",
            reply_markup: minApyKeyboard
          }
        );
        break;

      case "export_key":
        console.log(`✅ Matched case: export_key`);
        // Import and call the existing export handler with full safety checks
        const { exportHandler } = await import("./import-export");
        await exportHandler.handler(ctx);
        break;

      default:
        console.log(`❌ Unhandled settings option: "${option}"`);
        await ctx.answerCallbackQuery("Feature coming soon!");
    }
  } catch (error) {
    console.error("Error handling settings option:", error);
    await ctx.reply(ERRORS.NETWORK_ERROR);
  }
}

/**
 * Updates the user's risk level setting.
 * It saves the new setting to the session and the database, and confirms the change with the user.
 * @param {BotContext} ctx - The bot context.
 * @param {number} riskLevel - The new risk level selected by the user.
 * @returns {Promise<void>}
 */
export async function updateRiskLevel(ctx: BotContext, riskLevel: number): Promise<void> {
  try {
    const userId = ctx.session.userId;
    
    if (!userId) {
      await ctx.answerCallbackQuery("Session expired");
      return;
    }

    // Update session
    if (!ctx.session.settings) {
      ctx.session.settings = {
        userId,
        riskLevel: 3,
        slippage: 1,
        autoCompound: true,
        minApy: 5
      };
    }
    
    ctx.session.settings.riskLevel = riskLevel;

    // Save to database
    saveUserSettings(userId, ctx.session.settings);

    await ctx.answerCallbackQuery(`Risk level updated to ${riskLevel}`);
    
    // Show updated settings
    const description = getRiskDescription(riskLevel);
    await ctx.editMessageText(
      `✅ *Risk Level Updated*\n\n` +
      `**New Level**: ${riskLevel}/5\n` +
      `${description}\n\n` +
      `This affects which pools I'll recommend for auto-deployment.\n\n` +
      `**What's Next?**\n` +
      `• Use /zap to see opportunities at your risk level\n` +
      `• Higher risk = higher potential yields\n` +
      `• I'll still prioritize safety within your chosen level`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🦑 Start Earning", "zap_funds")
          .text("⚙️ More Settings", "open_settings")
      }
    );
  } catch (error) {
    console.error("Error updating risk level:", error);
    await ctx.answerCallbackQuery("Error updating settings");
  }
}

/**
 * Updates the user's slippage tolerance setting.
 * It saves the new setting to the session and the database, and confirms the change with the user.
 * @param {BotContext} ctx - The bot context.
 * @param {number} slippage - The new slippage percentage selected by the user.
 * @returns {Promise<void>}
 */
export async function updateSlippage(ctx: BotContext, slippage: number): Promise<void> {
  try {
    const userId = ctx.session.userId;
    
    if (!userId) {
      await ctx.answerCallbackQuery("Session expired");
      return;
    }

    // Update session
    if (!ctx.session.settings) {
      ctx.session.settings = {
        userId,
        riskLevel: 3,
        slippage: 1,
        autoCompound: true,
        minApy: 5
      };
    }
    
    ctx.session.settings.slippage = slippage;

    // Save to database
    saveUserSettings(userId, ctx.session.settings);

    await ctx.answerCallbackQuery(`Slippage updated to ${slippage}%`);
    
    await ctx.editMessageText(
      `✅ *Slippage Updated*\n\n` +
      `**New Slippage**: ${slippage}%\n\n` +
      `This affects the maximum price impact allowed when swapping tokens.\n\n` +
      `**Recommendations**:\n` +
      `• **Stablecoins**: 0.1-0.5% is usually sufficient\n` +
      `• **Volatile tokens**: 1-2% provides more flexibility\n` +
      `• **High volatility**: 3%+ may be needed but increases costs`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("⚙️ More Settings", "open_settings")
          .text("✅ Done", "settings_back")
      }
    );
  } catch (error) {
    console.error("Error updating slippage:", error);
    await ctx.answerCallbackQuery("Error updating settings");
  }
}

/**
 * Updates the user's minimum APY threshold setting.
 * It saves the new setting to the session and the database, and confirms the change with the user.
 * @param {BotContext} ctx - The bot context.
 * @param {number} minApy - The new minimum APY percentage selected by the user.
 * @returns {Promise<void>}
 */
export async function updateMinApy(ctx: BotContext, minApy: number): Promise<void> {
  try {
    const userId = ctx.session.userId;
    
    if (!userId) {
      await ctx.answerCallbackQuery("Session expired");
      return;
    }

    // Update session
    if (!ctx.session.settings) {
      ctx.session.settings = {
        userId,
        riskLevel: 3,
        slippage: 1,
        autoCompound: true,
        minApy: 5
      };
    }
    
    ctx.session.settings.minApy = minApy;

    // Save to database
    await saveUserSettings(userId, ctx.session.settings);
    
    await ctx.answerCallbackQuery(`Min APY updated to ${minApy}%`);
    await ctx.editMessageText(
      `✅ **Minimum APY Updated!**\n\n` +
      `Your new minimum APY threshold: **${minApy}%**\n\n` +
      `🎯 Only yield opportunities above ${minApy}% APY will be shown in:\n` +
      `• **/earn** command pool selection\n` +
      `• **/zap** command opportunities\n` +
      `• Auto-deployment when you deposit funds\n\n` +
      `💡 **Tip**: Lower thresholds show more options, higher thresholds focus on premium yields.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("⚙️ More Settings", "open_settings")
          .text("✅ Done", "settings_back")
      }
    );
  } catch (error) {
    console.error("Error updating min APY:", error);
    await ctx.answerCallbackQuery("Error updating settings");
  }
}

export default settingsHandler;