// TypeScript declarations for event-monitor.js
export function startEventMonitoringService(): Promise<void>;
export function forceRefreshWallets(): Promise<void>;
export function setPreDepositBalance(userId: string, balance: number): void;