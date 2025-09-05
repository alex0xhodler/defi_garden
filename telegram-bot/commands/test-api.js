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
const testApiHandler = {
    command: "test_api",
    description: "Test DeFiLlama API integration (development only)",
    handler: async (ctx) => {
        try {
            const userId = ctx.session.userId;
            if (!userId) {
                await ctx.reply("❌ Please start the bot first with /start command.");
                return;
            }
            await ctx.reply("🔄 Testing DeFiLlama API integration...\n\nThis may take a few seconds...");
            // Import and test the API
            const { testDeFiLlamaAPI } = await Promise.resolve().then(() => __importStar(require("../lib/defillama-api")));
            // Run the test
            await testDeFiLlamaAPI();
            await ctx.reply("✅ **API Test Completed!**\n\n" +
                "Real-time yield data has been fetched successfully. " +
                "Check the console logs for detailed APY information.\n\n" +
                "The bot is now using live data from DeFiLlama for yield calculations!");
        }
        catch (error) {
            console.error("API test error:", error);
            await ctx.reply("❌ **API Test Failed**\n\n" +
                `Error: ${error.message}\n\n` +
                "The bot will fall back to cached yield data. " +
                "This might be due to network issues or API rate limits.");
        }
    },
};
exports.default = testApiHandler;
