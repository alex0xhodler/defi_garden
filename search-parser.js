/* Pure natural-language search-query parser, extracted from app.js (spec 017:
   "every advertised typing-example must actually parse"). Loaded synchronously
   in home.html's analytics-conditional section BEFORE app.js runs, which
   references the global `parseNaturalLanguageQuery` at its call sites — this
   file is now the single source of truth: app.js no longer defines its own
   copy, and test_protocol_parsing.js / test_qualifier_fix.js / test_search.js
   all require it directly instead of keeping stale inline copies. UMD-style
   guard mirrors canonical.js. */
(function () {
    'use strict';

    // Natural Language Parsing Function
    var parseNaturalLanguageQuery = function (query, allTokens, allChains, allProtocols) {
        allTokens = allTokens || [];
        allChains = allChains || [];
        allProtocols = allProtocols || [];
        const lowerQuery = query.toLowerCase();
        let token = '';
        let chain = '';
        let poolTypes = [];

        // --- Parse Token ---
        // Context-aware token extraction with position scoring
        if (allTokens && allTokens.length > 0) {
            const exactTokenMatch = allTokens.find(t => t.toLowerCase() === lowerQuery);
            if (exactTokenMatch) {
                token = exactTokenMatch;
            } else {
                // Split query into words for context analysis
                const words = lowerQuery.split(/\s+/);

                // Filter out qualifier words that aren't tokens
                const qualifierWords = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
                const filteredWords = words.filter(word => !qualifierWords.includes(word));

                // Find chain context indicators to exclude words after them
                const chainIndicators = ['on', 'chain', 'network', 'blockchain'];
                let tokenCandidateWords = [];
                let wordsAfterChainIndicators = [];

                for (let i = 0; i < filteredWords.length; i++) {
                    if (chainIndicators.includes(filteredWords[i])) {
                        // Stop including words after chain indicators
                        tokenCandidateWords = filteredWords.slice(0, i);
                        wordsAfterChainIndicators = filteredWords.slice(i + 1);
                        break;
                    }
                }

                // If no chain indicators found, use first few filtered words (typically tokens come first)
                if (tokenCandidateWords.length === 0) {
                    tokenCandidateWords = filteredWords.slice(0, Math.min(3, filteredWords.length));
                }

                const tokenCandidateText = tokenCandidateWords.join(' ');

                // Common trading tokens (prioritize these)
                const commonTokens = ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'UNI', 'LINK', 'AAVE', 'COMP', 'MKR'];

                // Score tokens based on context and priority
                const tokenScores = [];

                for (const t of allTokens) {
                    const tokenLower = t.toLowerCase();
                    const escapedToken = tokenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const wordBoundaryRegex = new RegExp(`\\b${escapedToken}\\b`, 'i');

                    // Skip if this token appears after chain indicators (likely it's being used as a chain name)
                    if (wordsAfterChainIndicators.some(word => word.toLowerCase() === tokenLower)) {
                        continue;
                    }

                    if (wordBoundaryRegex.test(tokenCandidateText)) {
                        let score = 0;

                        // Position scoring: earlier words get higher scores
                        const tokenPosition = tokenCandidateText.toLowerCase().indexOf(tokenLower);
                        score += Math.max(0, 100 - tokenPosition * 10);

                        // Common token bonus
                        if (commonTokens.includes(t)) {
                            score += 50;
                        }

                        // Length bonus (prefer longer, more specific tokens)
                        score += t.length * 2;

                        tokenScores.push({ token: t, score });
                    }
                }

                // Sort by score and pick the highest
                if (tokenScores.length > 0) {
                    tokenScores.sort((a, b) => b.score - a.score);
                    token = tokenScores[0].token;
                }

                // Fallback: if no matches in candidate text, try token candidate text only (not full query)
                if (!token && tokenCandidateText) {
                    for (const t of allTokens) {
                        const tokenLower = t.toLowerCase();

                        // Skip if this token appears after chain indicators (likely it's being used as a chain name)
                        if (wordsAfterChainIndicators.some(word => word.toLowerCase() === tokenLower)) {
                            continue;
                        }

                        if (t.length >= 3 && tokenCandidateText.toLowerCase().includes(tokenLower)) {
                            // Double-check the CANDIDATE TEXT itself isn't a bare chain name or
                            // qualifier word being mistaken for a token substring (e.g. "solana"
                            // containing "sol" — checking tokenLower here was checking the wrong
                            // string and let it through).
                            const chainNames = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'fantom', 'solana'];
                            const qualifierWordsCheck = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
                            const candidateLower = tokenCandidateText.toLowerCase();
                            if (!chainNames.includes(candidateLower) && !qualifierWordsCheck.includes(candidateLower)) {
                                token = t;
                                break;
                            }
                        }
                    }
                }
            }
        }

        // --- Parse Chain ---
        // Mapping for common chain aliases
        const chainAliases = {
            'eth': 'Ethereum',
            'ethereum': 'Ethereum',
            'polygon': 'Polygon',
            'matic': 'Polygon',
            'arb': 'Arbitrum',
            'arbitrum': 'Arbitrum',
            'op': 'Optimism',
            'optimism': 'Optimism',
            'bnb': 'BNB Chain',
            'bsc': 'BNB Chain',
            'binance': 'BNB Chain',
            'avax': 'Avalanche',
            'avalanche': 'Avalanche',
            'sol': 'Solana',
            'solana': 'Solana',
            'ftm': 'Fantom',
            'fantom': 'Fantom',
            'zksync': 'zkSync Era',
            'base': 'Base',
            'linea': 'Linea',
            'celo': 'Celo',
            'gnosis': 'Gnosis',
            'moonbeam': 'Moonbeam',
            'cronos': 'Cronos'
        };

        if (allChains && allChains.length > 0) {
            for (const alias in chainAliases) {
                if (lowerQuery.includes(alias)) {
                    const matchedChain = chainAliases[alias];
                    if (allChains.includes(matchedChain)) { // Ensure it's a valid, available chain
                        chain = matchedChain;
                        break;
                    }
                }
            }

            // Alias table only covers a fixed set of chains — fall back to matching
            // any live chain name directly (word-boundary, case-insensitive) so new
            // chains DefiLlama adds (e.g. "Plasma") work without a code change here.
            if (!chain) {
                for (const c of allChains) {
                    const chainLower = c.toLowerCase();
                    const escapedChain = chainLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const chainWordBoundaryRegex = new RegExp(`\\b${escapedChain}\\b`, 'i');
                    if (chainWordBoundaryRegex.test(lowerQuery)) {
                        chain = c;
                        break;
                    }
                }
            }
        }

        // --- Parse Pool Types ---
        // Word-boundary "lend" stem so "lending"/"lender"/"lenders"/"lend" all match
        // (plain includes('lending') missed "kamino lenders").
        if (/\blend/i.test(lowerQuery)) {
            poolTypes.push('Lending');
        }
        if (lowerQuery.includes('lp') || lowerQuery.includes('dex')) {
            poolTypes.push('LP/DEX');
        }
        if (lowerQuery.includes('staking') || lowerQuery.includes('stake')) {
            poolTypes.push('Staking');
        }
        // Only add Yield Farming if it's explicitly mentioned as the main activity, not just descriptive
        if (lowerQuery.includes('farm') || lowerQuery.includes('farming')) {
            poolTypes.push('Yield Farming');
        }
        // Don't automatically add "Yield Farming" for generic "yield" mentions in queries like "best usdc yields"

        // Deduplicate pool types
        poolTypes = [...new Set(poolTypes)];

        // --- Parse Protocols ---
        let protocols = [];

        // Create dynamic protocol aliases from available protocols list
        const protocolAliases = {};

        // If we have available protocols, use them; otherwise fall back to static list
        if (allProtocols && allProtocols.length > 0) {
            // Generate aliases dynamically from available protocols
            allProtocols.forEach(protocol => {
                const friendlyName = protocol.friendlyName || protocol;
                const lowerFriendly = friendlyName.toLowerCase();

                // Create variations for each protocol
                const aliases = [lowerFriendly];

                // Add common variations
                if (lowerFriendly.includes('v2')) aliases.push(lowerFriendly.replace('v2', 'v-2'));
                if (lowerFriendly.includes('v3')) aliases.push(lowerFriendly.replace('v3', 'v-3'));
                if (lowerFriendly.includes('-')) aliases.push(lowerFriendly.replace(/-/g, ' '));
                if (lowerFriendly.includes(' ')) aliases.push(lowerFriendly.replace(/\s+/g, '-'));

                // Add original names if available
                if (protocol.originalNames && Array.isArray(protocol.originalNames)) {
                    protocol.originalNames.forEach(name => {
                        aliases.push(name.toLowerCase());
                    });
                }

                protocolAliases[friendlyName] = [...new Set(aliases)]; // Deduplicate
            });
        } else {
            // Fallback to static aliases for core protocols — this is the path a
            // freshly-typed search actually takes (no token/chain selected yet
            // means the live availableProtocols list is empty), so it must stay
            // current with protocols DeFi Garden actually advertises.
            Object.assign(protocolAliases, {
                'Aave': ['aave', 'aave-v2', 'aave-v3'],
                'Compound': ['compound', 'compound-v2', 'compound-v3', 'comp'],
                'Uniswap': ['uniswap', 'uniswap-v2', 'uniswap-v3', 'uni'],
                'Curve': ['curve', 'curve-dex', 'crv'],
                'Morpho': ['morpho', 'morpho-blue'],
                'Euler': ['euler'],
                'Venus': ['venus'],
                'Aerodrome': ['aerodrome', 'aerodrome-slipstream'],
                'PancakeSwap': ['pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 'pcs'],
                'Lido': ['lido'],
                'Rocket Pool': ['rocket-pool', 'rocketpool', 'rpl'],
                'Ether.fi': ['ether.fi', 'ether.fi-stake', 'etherfi'],
                'Jito': ['jito', 'jito-liquid-staking'],
                'Marinade': ['marinade'],
                'Raydium': ['raydium'],
                'Orca': ['orca'],
                'Balancer': ['balancer', 'balancer-v2', 'bal'],
                'Yearn': ['yearn', 'yearn-finance', 'yearn-v2'],
                'Pendle': ['pendle', 'pendle-finance'],
                'Sonic': ['sonic', 'sonic-protocol'],
                'Trader Joe': ['trader-joe', 'traderjoe', 'joe'],
                'SpookySwap': ['spookyswap', 'spooky', 'boo'],
                'SushiSwap': ['sushiswap', 'sushi'],
                'Convex': ['convex', 'cvx'],
                'Frax': ['frax', 'frax-finance'],
                'GMX': ['gmx'],
                'Stargate': ['stargate', 'stg'],
                'Kamino': ['kamino', 'kamino-lend', 'kamino lend', 'kamino-finance']
            });
        }

        // Protocol context keywords that typically precede protocol names
        const protocolKeywords = ['on', 'via', 'using', 'through', 'from', 'with', 'in'];

        // Method 1: Look for protocols after context keywords
        const words = lowerQuery.split(/\s+/);
        const qualifierWords = ['best', 'highest', 'top', 'good', 'great', 'yields', 'yield', 'farming', 'opportunities', 'rates', 'apy'];
        const filteredWords = words.filter(word => !qualifierWords.includes(word));

        // Chain names to avoid protocol conflicts
        const chainNames = ['base', 'ethereum', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'fantom', 'solana', 'binance', 'bnb'];

        for (let i = 0; i < filteredWords.length - 1; i++) {
            if (protocolKeywords.includes(filteredWords[i])) {
                const protocolCandidate = filteredWords[i + 1];

                // Skip if the candidate is likely a chain name
                if (chainNames.includes(protocolCandidate)) {
                    continue;
                }

                // Find matching protocol
                for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
                    if (aliases.some(alias => alias === protocolCandidate || protocolCandidate.includes(alias))) {
                        protocols.push(friendlyName);
                        break;
                    }
                }
            }
        }

        // Method 2: Direct protocol name detection (fallback)
        if (protocols.length === 0) {
            for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
                if (aliases.some(alias => lowerQuery.includes(alias))) {
                    // Additional check: avoid matching common words that might be part of other contexts
                    const aliasMatch = aliases.find(alias => lowerQuery.includes(alias));

                    // Skip if the alias is likely a chain name
                    if (chainNames.includes(aliasMatch)) {
                        continue;
                    }

                    const wordBoundaryRegex = new RegExp(`\\b${aliasMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

                    if (wordBoundaryRegex.test(lowerQuery)) {
                        protocols.push(friendlyName);
                    }
                }
            }
        }

        // Method 3: Protocol-first detection (e.g., "aave on arbitrum")
        if (protocols.length === 0) {
            const firstFilteredWord = filteredWords[0];
            if (firstFilteredWord) {
                for (const [friendlyName, aliases] of Object.entries(protocolAliases)) {
                    if (aliases.includes(firstFilteredWord)) {
                        protocols.push(friendlyName);
                        break;
                    }
                }
            }
        }

        // Deduplicate protocols
        protocols = [...new Set(protocols)];

        // --- Auto-set Chain for Protocol-Specific Contexts ---
        // If a protocol is detected but no chain is specified, auto-set the primary chain for that protocol
        if (protocols.length > 0 && !chain) {
            const protocolChainMapping = {
                'aerodrome': 'Base',
                'uniswap': 'Ethereum', // Default to mainnet for Uniswap
                'curve': 'Ethereum',   // Default to mainnet for Curve
                'kamino': 'Solana',
                // Add more as needed
            };

            for (const protocol of protocols) {
                if (protocolChainMapping[protocol.toLowerCase()]) {
                    chain = protocolChainMapping[protocol.toLowerCase()];
                    break; // Use the first matching protocol's chain
                }
            }
        }

        return { token, chain, poolTypes, protocols };
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = parseNaturalLanguageQuery;
    } else {
        window.parseNaturalLanguageQuery = parseNaturalLanguageQuery;
    }
})();
