import { Context, SessionFlavor } from "grammy";
import { SessionData } from "./types/commands";

/**
 * Defines the custom context type for the bot.
 * It extends the base grammY `Context` and adds the custom `SessionData` via `SessionFlavor`.
 * This makes `ctx.session` available and typed throughout the bot.
 */
export type BotContext = Context & SessionFlavor<SessionData>;

/**
 * Creates and returns an initial session object for a new user.
 * This function is called by the `session` middleware when a new session is started.
 * @returns {SessionData} A new session data object with default values.
 */
export function createInitialSessionData(): SessionData {
  return {
    userId: undefined,
    walletAddress: undefined,
    currentAction: undefined,
    tempData: {},
    settings: undefined, // Will be loaded from database after user registration
    zapMode: undefined, // 'auto' or 'manual'
    positions: [], // User's active DeFi positions
  };
}