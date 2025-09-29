"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOnrampSessionToken = generateOnrampSessionToken;
exports.generateApplePayOnrampUrl = generateApplePayOnrampUrl;
exports.generateFlexibleOnrampUrl = generateFlexibleOnrampUrl;
exports.getOnrampQuote = getOnrampQuote;
exports.generateQuickOnrampUrl = generateQuickOnrampUrl;
exports.generateCoinbasePayUrl = generateCoinbasePayUrl;
exports.generateFallbackPurchaseUrl = generateFallbackPurchaseUrl;
const axios_1 = __importDefault(require("axios"));
// Coinbase Commerce API configuration
const COINBASE_COMMERCE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY;
const COINBASE_ONRAMP_APP_ID = process.env.COINBASE_ONRAMP_APP_ID;
// Onramp API endpoints
const ONRAMP_BASE_URL = "https://api.developer.coinbase.com/onramp/v1";
const ONRAMP_PAY_URL = "https://pay.coinbase.com/buy";
/**
 * Generate session token for Coinbase Onramp
 */
async function generateOnrampSessionToken(destinationWallet, userId) {
    // Check if API credentials are configured
    if (!COINBASE_ONRAMP_APP_ID) {
        throw new Error("COINBASE_ONRAMP_APP_ID not configured. Please set up Coinbase onramp API credentials.");
    }
    try {
        const response = await axios_1.default.post(`${ONRAMP_BASE_URL}/session_token`, {
            partner_user_id: userId,
            destination_wallets: [{
                    address: destinationWallet,
                    blockchains: ["base"]
                }],
            // Only allow USDC purchases
            purchase_currency_codes: ["USDC"],
            country: "US" // For now, US only for Apple Pay support
        }, {
            headers: {
                "Authorization": `Bearer ${COINBASE_ONRAMP_APP_ID}`,
                "Content-Type": "application/json"
            }
        });
        return response.data.session_token;
    }
    catch (error) {
        console.error("Error generating onramp session token:", error);
        throw new Error("Failed to generate onramp session token");
    }
}
/**
 * Generate Apple Pay onramp URL for quick USDC purchase
 */
async function generateApplePayOnrampUrl(destinationWallet, userId, amount = 10 // Default $10 USDC
) {
    try {
        const sessionToken = await generateOnrampSessionToken(destinationWallet, userId);
        // Generate one-click-buy URL with preset amount
        const params = new URLSearchParams({
            sessionToken,
            defaultAsset: "USDC", // USDC on Base
            fiatCurrency: "USD",
            presetFiatAmount: amount.toString(),
            // Prefer Apple Pay if available
            defaultPaymentMethod: "APPLE_PAY"
        });
        return `${ONRAMP_PAY_URL}?${params.toString()}`;
    }
    catch (error) {
        console.error("Error generating Apple Pay onramp URL:", error);
        throw new Error("Failed to generate Apple Pay onramp URL");
    }
}
/**
 * Generate flexible onramp URL (debit card + Apple Pay)
 */
async function generateFlexibleOnrampUrl(destinationWallet, userId) {
    try {
        const sessionToken = await generateOnrampSessionToken(destinationWallet, userId);
        // Generate flexible URL without preset amount - let user choose
        const params = new URLSearchParams({
            sessionToken,
            defaultAsset: "USDC" // USDC on Base
        });
        return `${ONRAMP_PAY_URL}?${params.toString()}`;
    }
    catch (error) {
        console.error("Error generating flexible onramp URL:", error);
        throw new Error("Failed to generate onramp URL");
    }
}
/**
 * Get onramp quote for display purposes
 */
async function getOnrampQuote(fiatAmount, currency = "USD") {
    try {
        const response = await axios_1.default.post(`${ONRAMP_BASE_URL}/buy/quote`, {
            purchase_currency: "USDC",
            payment_currency: currency,
            payment_amount: fiatAmount.toString(),
            country: "US",
            payment_method: "DEBIT_CARD"
        }, {
            headers: {
                "Authorization": `Bearer ${COINBASE_ONRAMP_APP_ID}`,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    }
    catch (error) {
        console.error("Error getting onramp quote:", error);
        throw new Error("Failed to get onramp quote");
    }
}
/**
 * Simple onramp URL generation for preset amounts
 */
function generateQuickOnrampUrl(destinationWallet, sessionToken, fiatAmount = 10) {
    const params = new URLSearchParams({
        sessionToken,
        defaultAsset: "USDC",
        fiatCurrency: "USD",
        presetFiatAmount: fiatAmount.toString()
    });
    return `${ONRAMP_PAY_URL}?${params.toString()}`;
}
/**
 * Generate simple Coinbase Pay URL (no API required)
 * This creates a basic Coinbase commerce link for USDC purchase
 */
function generateCoinbasePayUrl(destinationWallet, amount = 20) {
    // Using Coinbase commerce public interface
    const baseUrl = "https://commerce.coinbase.com/checkout";
    const params = new URLSearchParams({
        // This would need to be replaced with actual Coinbase Commerce charge ID
        // For now, redirect to Coinbase with USDC purchase intent
        redirect_uri: encodeURIComponent(`https://coinbase.com/price/usd-coin?address=${destinationWallet}`),
        amount: amount.toString(),
        currency: "USD",
        crypto_currency: "USDC",
        network: "base"
    });
    // Simple fallback to Coinbase USDC purchase page with wallet address
    return `https://www.coinbase.com/price/usd-coin?utm_source=bot&destination=${destinationWallet}&network=base&amount=${amount}`;
}
/**
 * Generate basic USDC purchase link (universal fallback)
 */
function generateFallbackPurchaseUrl(destinationWallet) {
    return `https://www.coinbase.com/how-to-buy/usd-coin?utm_source=telegram_bot&destination_hint=${destinationWallet}`;
}
