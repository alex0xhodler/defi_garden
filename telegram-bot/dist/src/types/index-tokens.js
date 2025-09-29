"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDEX_CATEGORIES = void 0;
// Constants for index categories
exports.INDEX_CATEGORIES = {
    blue_chip: {
        category: 'blue_chip',
        displayName: 'Blue Chip Index',
        description: 'BTC, ETH, and major cryptocurrencies with proven track records',
        emoji: '🏛️',
        riskRange: [2, 4],
        expectedReturn: '6-10% annually'
    },
    defi: {
        category: 'defi',
        displayName: 'DeFi Protocol Index',
        description: 'Leading DeFi tokens like AAVE, UNI, COMP, and SUSHI',
        emoji: '🚀',
        riskRange: [4, 6],
        expectedReturn: '12-25% annually'
    },
    emerging: {
        category: 'emerging',
        displayName: 'Emerging Protocols',
        description: 'New protocols and Layer 2 tokens with high growth potential',
        emoji: '💎',
        riskRange: [7, 9],
        expectedReturn: '20-50% annually'
    },
    sector: {
        category: 'sector',
        displayName: 'Sector Rotation',
        description: 'Thematic investments in AI, Gaming, RWA, and trending sectors',
        emoji: '🌍',
        riskRange: [5, 8],
        expectedReturn: '15-35% annually'
    }
};
