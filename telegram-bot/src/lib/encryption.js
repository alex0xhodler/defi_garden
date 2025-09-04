"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.generateEncryptionKey = generateEncryptionKey;
exports.verifyEncryptionKey = verifyEncryptionKey;
const crypto_js_1 = __importDefault(require("crypto-js"));
const constants_1 = require("../utils/constants");
/**
 * Encrypt sensitive data (like private keys)
 */
function encrypt(text) {
    if (!constants_1.ENCRYPTION_KEY) {
        throw new Error("Encryption key not set in environment variables");
    }
    return crypto_js_1.default.AES.encrypt(text, constants_1.ENCRYPTION_KEY).toString();
}
/**
 * Decrypt encrypted data
 */
function decrypt(encryptedText) {
    if (!constants_1.ENCRYPTION_KEY) {
        throw new Error("Encryption key not set in environment variables");
    }
    const bytes = crypto_js_1.default.AES.decrypt(encryptedText, constants_1.ENCRYPTION_KEY);
    return bytes.toString(crypto_js_1.default.enc.Utf8);
}
/**
 * Generate a random encryption key
 */
function generateEncryptionKey() {
    return crypto_js_1.default.lib.WordArray.random(32).toString();
}
/**
 * Verify if the encryption key is valid by testing encryption/decryption
 */
function verifyEncryptionKey() {
    try {
        const testData = "test encryption";
        const encrypted = encrypt(testData);
        const decrypted = decrypt(encrypted);
        return decrypted === testData;
    }
    catch (error) {
        console.error("Encryption key verification failed:", error);
        return false;
    }
}
