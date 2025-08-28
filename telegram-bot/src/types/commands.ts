import { Context } from "grammy";
import { UserSettings, Position } from "./config";

export interface SessionData {
  userId?: string;
  walletAddress?: string;
  currentAction?: string;
  tempData?: Record<string, any>;
  settings?: UserSettings;
  zapMode?: "auto" | "manual"; // Auto-deploy vs manual protocol selection
  positions?: Position[]; // User's active DeFi positions
  awaitingWithdrawAmount?: boolean; // For custom withdrawal amount input
  retryZap?: { // For retrying failed zap with same parameters
    amount: string;
    selectedPool: string;
    poolInfo: any;
    walletAddress: string;
  };
}

export interface BotContext extends Context {
  session: SessionData;
}

export interface CommandHandler {
  command: string;
  description: string;
  handler: (ctx: BotContext) => Promise<void>;
}

export interface StepHandler {
  handler: (ctx: BotContext) => Promise<void>;
  next?: string;
}

export interface ConversationState {
  [key: string]: any;
}

export type SettingsOption = "risk" | "slippage" | "autoCompound" | "minApy";

// Zap-specific temp data structure
export interface ZapTempData {
  selectedToken?: string;
  selectedPool?: string;
  amount?: string;
  poolInfo?: {
    protocol: string;
    apy: number;
    tvlUsd: number;
    riskScore: number;
    address: string;
    underlyingToken: string;
  };
  gasEstimate?: string;
  quote?: {
    outputAmount: string;
    priceImpact: string;
  };
}

// Action types for the bot state machine
export type ActionType = 
  | "import_wallet"
  | "export_wallet" 
  | "zap_amount"
  | "zap_confirm"
  | "harvest_confirm"
  | "withdraw_address"
  | "withdraw_amount" 
  | "withdraw_confirm";