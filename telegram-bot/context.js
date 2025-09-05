"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialSessionData = createInitialSessionData;
// Helper function to create a new session
function createInitialSessionData() {
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
