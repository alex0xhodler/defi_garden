import CryptoJS from "crypto-js";
import { ENCRYPTION_KEY } from "../utils/constants";

/**
 * Encrypts a given text string using AES encryption.
 * It uses a secret key from the environment variables.
 * @param {string} text - The plaintext string to encrypt.
 * @returns {string} The AES-encrypted string.
 * @throws Will throw an error if the encryption key is not set.
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("Encryption key not set in environment variables");
  }

  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

/**
 * Decrypts an AES-encrypted string.
 * It uses a secret key from the environment variables.
 * @param {string} encryptedText - The AES-encrypted string.
 * @returns {string} The decrypted plaintext string.
 * @throws Will throw an error if the encryption key is not set.
 */
export function decrypt(encryptedText: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("Encryption key not set in environment variables");
  }

  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Generates a new, random 32-byte encryption key.
 * @returns {string} A randomly generated encryption key as a hex string.
 */
export function generateEncryptionKey(): string {
  return CryptoJS.lib.WordArray.random(32).toString();
}

/**
 * Verifies that the currently configured encryption key is valid by performing a test encryption and decryption cycle.
 * @returns {boolean} True if the key is valid, false otherwise.
 */
export function verifyEncryptionKey(): boolean {
  try {
    const testData = "test encryption";
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    return decrypted === testData;
  } catch (error) {
    console.error("Encryption key verification failed:", error);
    return false;
  }
}
