"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportHandler = exports.importHandler = void 0;
exports.handlePrivateKeyInput = handlePrivateKeyInput;
exports.handleExportConfirmation = handleExportConfirmation;
const token_wallet_1 = require("../lib/token-wallet");
const validators_1 = require("../utils/validators");
const grammy_1 = require("grammy");
const keyboardHelper_1 = require("../utils/keyboardHelper");
exports.importHandler = {
    command: "import",
    description: "Import wallet via private key",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Check if user already has a wallet
            const existingWallet = await ctx.session.walletAddress;
            if (existingWallet) {
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("Yes, import new wallet", "confirm_import_wallet")
                    .text("No, keep current wallet", "cancel_import_wallet");
                await ctx.reply("⚠️ You already have a wallet set up. Importing a new wallet will replace your current one.\n\n" +
                    "*Make sure you have exported your private key if you want to keep access to your current wallet.*\n\n" +
                    "Do you want to continue?", {
                    parse_mode: "Markdown",
                    reply_markup: keyboard,
                });
                return;
            }
            // Set current action
            ctx.session.currentAction = "import_wallet";
            await ctx.reply("🔑 Please send your private key.\n\n" +
                "*For security reasons*:\n" +
                "- Private keys are stored in an encrypted format\n" +
                "- You can delete this message after I process it\n" +
                "- Never share your private key with anyone else\n" +
                "- You can cancel this operation by typing /cancel", { parse_mode: "Markdown" });
        }
        catch (error) {
            console.error("Error in import command:", error);
            await ctx.reply("❌ An error occurred. Please try again later.");
        }
    },
};
// Handler for private key input
async function handlePrivateKeyInput(ctx) {
    try {
        const userId = ctx.session.userId;
        const privateKey = ctx.message?.text;
        if (!userId || !privateKey) {
            await ctx.reply("❌ Invalid request. Please try again.");
            return;
        }
        // Validate private key format
        if (!(0, validators_1.isValidPrivateKey)(privateKey)) {
            await ctx.reply("❌ Invalid private key format. Please provide a valid 64-character hexadecimal private key with or without 0x prefix.\n\n" +
                "Try again or type /cancel to abort.");
            return;
        }
        await ctx.reply("🔐 Importing your wallet...");
        // Import the wallet
        const wallet = await (0, token_wallet_1.importWallet)(userId, privateKey);
        ctx.session.walletAddress = wallet.address;
        // Reset current action
        ctx.session.currentAction = undefined;
        const keyboard = new grammy_1.InlineKeyboard()
            .text("💰 Check Balance", "check_balance");
        await ctx.reply(`✅ *Wallet imported successfully!*\n\n` +
            `*Address*: \`${wallet.address}\`\n\n` +
            `Now you can:\n` +
            `- Use /deposit to receive funds\n` +
            `- Use /balance to check your balance\n` +
            `- Use /buy to buy tokens with ETH`, {
            parse_mode: "Markdown",
            reply_markup: keyboard,
        });
    }
    catch (error) {
        console.error("Error handling private key input:", error);
        ctx.session.currentAction = undefined;
        await ctx.reply("❌ An error occurred while importing your wallet. Please try again later.");
    }
}
exports.exportHandler = {
    command: "export",
    description: "Display private key (with confirmation prompt)",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            // Get user's wallet
            const wallet = await (0, token_wallet_1.getWallet)(userId);
            if (!wallet) {
                await ctx.reply("❌ You don't have a wallet yet.\n\n" +
                    "Use /create to create a new wallet or /import to import an existing one.");
                return;
            }
            // Set current action
            ctx.session.currentAction = "export_wallet";
            // Show warning and confirmation prompt
            await ctx.reply("⚠️ *SECURITY WARNING*\n\n" +
                "You are about to export your private key. This is sensitive information that gives complete control over your wallet funds.\n\n" +
                "*NEVER*:\n" +
                "- Share your private key with anyone\n" +
                "- Enter it on websites\n" +
                "- Take screenshots of it\n\n" +
                "Are you sure you want to proceed?", {
                parse_mode: "Markdown",
                reply_markup: (0, keyboardHelper_1.createConfirmationKeyboard)(),
            });
        }
        catch (error) {
            console.error("Error in export command:", error);
            await ctx.reply("❌ An error occurred. Please try again later.");
        }
    },
};
// Handle export confirmation
async function handleExportConfirmation(ctx, confirmed) {
    try {
        // Remove the confirmation keyboard
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        if (!confirmed) {
            // Check if user is in onboarding state (onboardingCompleted is null)
            const { getUserByTelegramId } = await Promise.resolve().then(() => __importStar(require("../lib/database")));
            const user = getUserByTelegramId(ctx.session.userId || "");
            if (user && user.onboardingCompleted === null) {
                // Get current highest APY
                const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                const apy = await getHighestAPY();
                // User is still in onboarding - only export key option
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("🔑 Export Private Key", "export_key");
                await ctx.reply("Operation cancelled. Your private key was not exported.\n\n" +
                    `🚀 *Ready to start earning ${apy}% APY anyway?*\n` +
                    "You can always export your key later from settings.", {
                    reply_markup: keyboard,
                });
            }
            else {
                // Get current highest APY
                const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
                const apy = await getHighestAPY();
                // User has completed onboarding - show full menu
                const keyboard = new grammy_1.InlineKeyboard()
                    .text("💰 Send USDC to Address", "deposit")
                    .row()
                    .text("🚀 Start Earning", "zap_auto_deploy")
                    .text("💰 Check Balance", "check_balance");
                await ctx.reply("Operation cancelled. Your private key was not exported.\n\n" +
                    `🚀 *Ready to start earning ${apy}% APY anyway?*\n` +
                    "You can always export your key later from settings.", {
                    reply_markup: keyboard,
                });
            }
            return;
        }
        const userId = ctx.session.userId;
        if (!userId) {
            await ctx.reply("❌ Session expired. Please use /start to begin again.");
            return;
        }
        // Get user's wallet
        const wallet = await (0, token_wallet_1.getWallet)(userId);
        if (!wallet) {
            await ctx.reply("❌ Wallet not found. Please create or import a wallet first.");
            return;
        }
        // Extract private key
        const privateKey = (0, token_wallet_1.getPrivateKey)(wallet);
        // Send private key in a separate message that auto-deletes after 60 seconds
        await ctx.reply("🔑 *Your Private Key*\n\n" + `\`${privateKey}\`\n\n`, {
            parse_mode: "Markdown",
        });
        // Send follow-up reminder about security with action buttons
        // Check if user is in onboarding state
        const { getUserByTelegramId } = await Promise.resolve().then(() => __importStar(require("../lib/database")));
        const user = getUserByTelegramId(userId || "");
        if (user && user.onboardingCompleted === null) {
            // Get current Compound V3 APY
            const { getCompoundV3APY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
            const apy = await getCompoundV3APY();
            // User is still in onboarding - show clean deposit message with manual check
            const keyboard = new grammy_1.InlineKeyboard()
                .text("🔍 Check for Deposit", "manual_balance_check");
            await ctx.reply("✅ *Private key exported successfully!*\n\n" +
                "🔐 Save your keys securely - you can restore your wallet anytime.\n\n" +
                `💰 *Now deposit USDC to start earning up to ${apy}% APY*\n\n` +
                "I'm monitoring your address and will auto-deploy your funds to the best yield opportunity as soon as they arrive!", {
                parse_mode: "Markdown",
                reply_markup: keyboard,
            });
        }
        else {
            // Get current highest APY
            const { getHighestAPY } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
            const apy = await getHighestAPY();
            // User has completed onboarding - show full menu
            const keyboard = new grammy_1.InlineKeyboard()
                .text("💰 Send USDC to Address", "deposit")
                .row()
                .text("🚀 Start Earning", "zap_auto_deploy")
                .text("💰 Check Balance", "check_balance");
            await ctx.reply("⚠️ *REMINDER*\n\n" +
                "Your private key has been displayed. For security:\n\n" +
                "1. Save it in a secure password manager\n" +
                "2. Never share it with anyone\n" +
                "3. Delete any chat history containing this key\n\n" +
                `🚀 *Ready to start earning ${apy}% APY?*`, {
                parse_mode: "Markdown",
                reply_markup: keyboard,
            });
        }
        // Reset current action
        ctx.session.currentAction = undefined;
    }
    catch (error) {
        console.error("Error handling export confirmation:", error);
        await ctx.reply("❌ An error occurred while exporting your private key. Please try again later.");
    }
}
