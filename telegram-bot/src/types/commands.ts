import { Context } from "grammy";
import { UserSettings, Position } from "./config";

/**
 * Defines the structure of the data stored in the user's session.
 * This is used to maintain state between different interactions with the bot.
 */
export interface SessionData {
  /** The user's unique identifier. */
  userId?: string;
  /** The user's wallet address. */
  walletAddress?: string;
  /** The current multi-step action the user is performing (e.g., 'import_wallet'). */
  currentAction?: string;
  /** A temporary data store for the current action. */
  tempData?: Record<string, any>;
  /** The user's personalized settings. */
  settings?: UserSettings;
  /** The selected mode for the 'zap' (invest) feature. */
  zapMode?: "auto" | "manual";
  /** The user's active DeFi positions. */
  positions?: Position[];
  /** A flag indicating if the bot is waiting for the user to input a custom withdrawal amount. */
  awaitingWithdrawAmount?: boolean;
  /** Data stored to allow retrying a failed 'zap' transaction with the same parameters. */
  retryZap?: {
    amount: string;
    selectedPool: string;
    poolInfo: any;
  };
  /** Data for a transaction that failed due to insufficient balance, to allow for smart recovery. */
  pendingTransaction?: {
    type: 'invest' | 'withdraw';
    protocol: string;
    poolId: string;
    amount: number;
    apy: number;
    shortage: number;
    timestamp: number;
    reminderSent?: boolean;
  };
}

/**
 * Extends the base grammY Context to include our custom session data structure.
 */
export interface BotContext extends Context {
  /** The session data for the current user. */
  session: SessionData;
}

/**
 * Defines the structure for a bot command handler.
 */
export interface CommandHandler {
  /** The command string (e.g., 'start'). */
  command: string;
  /** A brief description of the command for help menus. */
  description: string;
  /** The asynchronous function that handles the command logic. */
  handler: (ctx: BotContext) => Promise<void>;
}

/**
 * Defines the structure for a step in a multi-step conversation flow.
 */
export interface StepHandler {
  /** The handler function for this step. */
  handler: (ctx: BotContext) => Promise<void>;
  /** The key for the next step in the flow. */
  next?: string;
}

/**
 * A generic type for storing state within a conversation.
 */
export interface ConversationState {
  [key: string]: any;
}

/**
 * Defines the possible options available in the settings menu.
 */
export type SettingsOption = "risk" | "slippage" | "autoCompound" | "minApy" | "export_key";

/**
 * Defines the structure for temporary data stored during a 'zap' (invest) operation.
 */
export interface ZapTempData {
  /** The token selected for the investment. */
  selectedToken?: string;
  /** The ID of the selected investment pool. */
  selectedPool?: string;
  /** The amount to invest. */
  amount?: string;
  /** Information about the selected pool. */
  poolInfo?: {
    protocol: string;
    apy: number;
    tvlUsd: number;
    riskScore: number;
    address: string;
    underlyingToken: string;
  };
  /** The estimated gas cost for the transaction. */
  gasEstimate?: string;
  /** The quote received from a swap aggregator, if applicable. */
  quote?: {
    outputAmount: string;
    priceImpact: string;
  };
}

/**
 * Defines the possible action types that represent the bot's current state in a multi-step flow.
 */
export type ActionType =
  | "import_wallet"
  | "export_wallet"
  | "zap_amount"
  | "zap_confirm"
  | "harvest_confirm"
  | "withdraw_address"
  | "withdraw_amount" 
  | "withdraw_confirm"
  | "withdraw_eth_address"
  | "withdraw_usdc_address"
  | "withdraw_eth_amount"
  | "withdraw_usdc_amount";