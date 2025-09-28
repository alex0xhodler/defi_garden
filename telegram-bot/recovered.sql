BEGIN;
PRAGMA writable_schema = on;
PRAGMA encoding = 'UTF-8';
PRAGMA page_size = '4096';
PRAGMA auto_vacuum = '0';
PRAGMA user_version = '0';
PRAGMA application_id = '0';
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE users (
      userId TEXT PRIMARY KEY,
      telegramId TEXT NOT NULL,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      createdAt INTEGER NOT NULL,
      onboardingCompleted INTEGER,
      lastBalanceCheck INTEGER,
      expectingDepositUntil INTEGER,
      notificationSettings TEXT,
      session_data TEXT
    );
CREATE TABLE wallets (
      address TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      encryptedPrivateKey TEXT NOT NULL,
      type TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      autoCreated INTEGER NOT NULL DEFAULT 0, isDeployed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (userId) REFERENCES users(userId)
    );
CREATE TABLE settings (
      userId TEXT PRIMARY KEY,
      riskLevel INTEGER NOT NULL DEFAULT 3,
      slippage REAL NOT NULL DEFAULT 1.0,
      autoCompound INTEGER NOT NULL DEFAULT 1,
      minApy REAL NOT NULL DEFAULT 5.0,
      FOREIGN KEY (userId) REFERENCES users(userId)
    );
CREATE TABLE positions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      poolId TEXT NOT NULL,
      protocol TEXT NOT NULL,
      chain TEXT NOT NULL,
      tokenSymbol TEXT NOT NULL,
      amountInvested REAL NOT NULL,
      currentValue REAL NOT NULL,
      entryApy REAL NOT NULL,
      currentApy REAL NOT NULL,
      yieldEarned REAL NOT NULL DEFAULT 0,
      txHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastUpdated INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(userId)
    );
CREATE TABLE transactions (
      txHash TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      walletAddress TEXT NOT NULL,
      operationType TEXT NOT NULL,
      poolId TEXT,
      protocol TEXT,
      tokenSymbol TEXT NOT NULL,
      amount TEXT NOT NULL,
      yieldEarned TEXT,
      status TEXT NOT NULL,
      gasUsed TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(userId),
      FOREIGN KEY (walletAddress) REFERENCES wallets(address)
    );
CREATE TABLE protocol_rates (
      protocol TEXT PRIMARY KEY,
      apy REAL NOT NULL,
      apyBase REAL NOT NULL,
      apyReward REAL NOT NULL,
      tvlUsd REAL NOT NULL,
      lastUpdated INTEGER NOT NULL
    );
CREATE TABLE index_tokens (
    tokenId TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('blue_chip', 'defi', 'emerging', 'sector')),
    contractAddress TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'base',
    description TEXT,
    riskLevel INTEGER NOT NULL CHECK (riskLevel >= 1 AND riskLevel <= 10),
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt INTEGER NOT NULL,
    lastUpdated INTEGER NOT NULL
);
CREATE TABLE index_compositions (
    id TEXT PRIMARY KEY,
    indexTokenId TEXT NOT NULL,
    underlyingToken TEXT NOT NULL,
    underlyingSymbol TEXT NOT NULL,
    weightPercentage REAL NOT NULL CHECK (weightPercentage > 0 AND weightPercentage <= 100),
    lastUpdated INTEGER NOT NULL,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);
CREATE TABLE index_positions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    indexTokenId TEXT NOT NULL,
    tokensOwned REAL NOT NULL CHECK (tokensOwned >= 0),
    averageBuyPrice REAL NOT NULL CHECK (averageBuyPrice > 0), -- in USDC per token
    totalInvested REAL NOT NULL CHECK (totalInvested > 0), -- Total USDC spent
    currentValue REAL NOT NULL CHECK (currentValue >= 0), -- Current USD value
    firstPurchaseAt INTEGER NOT NULL,
    lastUpdatedAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);
CREATE TABLE index_transactions (
    txHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    indexTokenId TEXT NOT NULL,
    operationType TEXT NOT NULL CHECK (operationType IN ('buy', 'sell')),
    usdcAmount REAL NOT NULL CHECK (usdcAmount > 0), -- Amount in USDC
    tokensAmount REAL NOT NULL CHECK (tokensAmount > 0), -- Index tokens received/sold
    pricePerToken REAL NOT NULL CHECK (pricePerToken > 0), -- USDC per index token at time of transaction
    gasUsed TEXT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId) ON DELETE CASCADE
);
CREATE TABLE migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
INSERT OR IGNORE INTO 'users'(_rowid_, 'userId', 'telegramId', 'username', 'firstName', 'lastName', 'createdAt', 'onboardingCompleted', 'lastBalanceCheck', 'expectingDepositUntil', 'notificationSettings', 'session_data') VALUES (1, '231650994', '231650994', 'w00tcake', 'Alex', NULL, 1757142857381, 1757419229836, 1757153623345, 1758796811690, NULL, '{"monitoringContext":{"type":"onboarding","timestamp":1758796511691,"metadata":{"userType":"existing_fallback","error":"balance_check_failed"}},"pendingTransaction":{"type":"invest","protocol":"Index Token - LCAP","poolId":"blue_chip_01","amount":10,"apy":0,"shortage":9.99,"timestamp":1758748188601,"reminderSent":false,"isManualSelection":true,"deployFn":"buyIndexToken","service":"index-tokens","displayName":"Large Cap Index","project":"Index Token","poolInfo":{"displayName":"Large Cap Index","project":"Index Token","service":"index-tokens","deployFn":"buyIndexToken","category":"blue_chip"}}}');
INSERT OR IGNORE INTO 'users'(_rowid_, 'userId', 'telegramId', 'username', 'firstName', 'lastName', 'createdAt', 'onboardingCompleted', 'lastBalanceCheck', 'expectingDepositUntil', 'notificationSettings', 'session_data') VALUES (4, '2060330584', '2060330584', 'alexbeansso', 'Alex | Beans.so', NULL, 1758800989668, NULL, 1758800990003, 1758801290004, NULL, '{"monitoringContext":{"type":"onboarding","timestamp":1758800990005,"metadata":{"userType":"new_user","walletCreated":true}}}');
INSERT OR IGNORE INTO 'users'(_rowid_, 'userId', 'telegramId', 'username', 'firstName', 'lastName', 'createdAt', 'onboardingCompleted', 'lastBalanceCheck', 'expectingDepositUntil', 'notificationSettings', 'session_data') VALUES (5, '6499212858', '6499212858', 'teo_inkvest', 'Teo', NULL, 1758803039801, NULL, 1758803040316, 1758808275385, NULL, '{"monitoringContext":{"type":"generic_deposit","timestamp":1758807975387,"metadata":{"command":"/deposit","walletType":"coinbase-smart-wallet"}}}');
INSERT OR IGNORE INTO 'wallets'(_rowid_, 'address', 'userId', 'encryptedPrivateKey', 'type', 'createdAt', 'autoCreated', 'isDeployed') VALUES (1, '0xc8465a06cF21cB616bF152347add102C4E0D1583', '231650994', 'U2FsdGVkX18Zuh8Ds9wBYIG4hlxgrZYQ8SWGQ+vlNiVXhVQOROS8IA14wtqkDSklJehpTZhVM+3ib9b1K1VjsjQBvudg23qw+0bwyX1HuaXColxs5trlZLyRk/CfcX8y', 'coinbase-smart-wallet', 1757153623343, 1, 1);
INSERT OR IGNORE INTO 'wallets'(_rowid_, 'address', 'userId', 'encryptedPrivateKey', 'type', 'createdAt', 'autoCreated', 'isDeployed') VALUES (4, '0x1C4e2359EfFA98073550Cc1698e16E8188E78E2E', '2060330584', 'U2FsdGVkX18y36uQIUKjzhLPPkktGz2awj8RXZ2VERVvEXesSp/7sztKYTlLvu47y5LFyOt0fdLnp40r9U6RspjaeO52ngS/74MtCDNUOVbBGVQyAqc21c/mH1RR3W/c', 'coinbase-smart-wallet', 1758800990001, 1, 0);
INSERT OR IGNORE INTO 'wallets'(_rowid_, 'address', 'userId', 'encryptedPrivateKey', 'type', 'createdAt', 'autoCreated', 'isDeployed') VALUES (5, '0x5bc3f639226C605dbbc0f854358bAFd5539B6E1c', '6499212858', 'U2FsdGVkX1+DFJRa25jxZwS2Rii/9U9c+mDtehfh+k9dLCHUamKjWNewh/El9A8SHwBSDjTUJS7kxT7Q5SL+/rTP+l/ab6S0qaEcYfGKBk87WjM9L+aR5P8S8GD+NFEh', 'coinbase-smart-wallet', 1758803040315, 1, 0);
INSERT OR IGNORE INTO 'settings'(_rowid_, 'userId', 'riskLevel', 'slippage', 'autoCompound', 'minApy') VALUES (21, '231650994', 5, 1, 1, 4);
INSERT OR IGNORE INTO 'settings'(_rowid_, 'userId', 'riskLevel', 'slippage', 'autoCompound', 'minApy') VALUES (22, '2060330584', 3, 1, 1, 5);
INSERT OR IGNORE INTO 'settings'(_rowid_, 'userId', 'riskLevel', 'slippage', 'autoCompound', 'minApy') VALUES (27, '6499212858', 3, 1, 1, 5);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (23, 'pos_1757342146203_231650994', '231650994', 'seamless-usdc-base', 'Seamless', 'Base', 'USDC', 3, 3, 7.42, 7.42, 0, '0x4d3051f769827b41ecae074127eb1ff419173c020d610c1b2fe5571ba31925bf', 1757342146203, 1757342146205);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (24, 'pos_1757368076500_231650994', '231650994', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'Base', 'USDC', 1, 1, 9.37, 9.37, 0, '0x1442e3949c07e155ddedf4729eae743404209be18532bed918559ecac8cd6fea', 1757368076500, 1757368076501);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (25, 'pos_1757411723075_231650994', '231650994', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'Base', 'USDC', 1, 1, 9.91, 9.91, 0, '0xd46d5c1ef8a45a955b0c71e01b184b24a12535cf35c4ae475ae474d835cd066d', 1757411723076, 1757411723077);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (26, 'pos_1757411755441_231650994', '231650994', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'Base', 'USDC', 1, 1, 9.91, 9.91, 0, '0x1d84ac68b816c804c56455b22b6535ee6e90126b7743e2b7a9d6fb430d89871c', 1757411755441, 1757411755444);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (27, 'pos_1757415227163_231650994', '231650994', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'Base', 'USDC', 1, 1, 10.01, 10.01, 0, '0x57d8675dc460a5387d703555b4c9a2770a2595908d390af2b75f0e2660e24b98', 1757415227163, 1757415227164);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (28, 'pos_1757419229838_231650994', '231650994', 'fluid-usdc-base', 'Fluid', 'Base', 'USDC', 1, 1, 7.48, 7.48, 0, '0xa98d73aeec8a2167dcf788884e80a1b37979a9645e500ab30c0882cfb544f872', 1757419229838, 1757419229840);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (29, 'pos_1757419660611_231650994', '231650994', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'Base', 'USDC', 1, 1, 9.95, 9.95, 0, '0x4110ca8b8f87268273a7f11801d87f217c621ce5ad25db825b8658ce33ae970e', 1757419660612, 1757419660612);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (1, 'pos_1757158478421_231650994', '231650994', 'curve-usdc-crvusd-base', 'Curve', 'Base', 'USDC', 1, 1, 5.26, 5.26, 0, '0x432bff565727e9c077e60b0f53deb250e0c7766273943bdddaa3e8c3bc35e079', 1757158478421, 1757158478422);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (2, 'pos_1757159969951_231650994', '231650994', 'curve-usdc-crvusd-base', 'Curve', 'Base', 'USDC', 1, 1, 5.26, 5.26, 0, '0x746e828edc5f75d4b9db2855d4761a11d5e78535b4d3cb6fb69963580fa47862', 1757159969951, 1757159969952);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (3, 'pos_1757160446667_231650994', '231650994', 'curve-usdc-crvusd-base', 'Curve', 'Base', 'USDC', 1, 1, 5.26, 5.26, 0, '0x29ad3e074686359806b834d18ebf4d45edd3f378b86a1c209a0e8e7124ab784c', 1757160446667, 1757160446670);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (4, 'pos_1757160722710_231650994', '231650994', 'curve-usdc-crvusd-base', 'Curve', 'Base', 'USDC', 1, 1, 5.26, 5.26, 0, '0x594800d9af144869957b0cad88f0ab5ffd291a71bec613c2b8f22fd9d29eb101', 1757160722710, 1757160722710);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (5, 'pos_1757161605026_231650994', '231650994', 'curve-usdc-crvusd-base', 'Curve', 'Base', 'USDC', 1, 1, 5.26, 5.26, 0, '0x7065d93472515deeeb218aa9dd37107030799d62d3bca6f1dac19e9e55bdf637', 1757161605026, 1757161605026);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (6, 'pos_1757193820442_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.39, 8.39, 0, '0x97eb975260e582293712be54b5949d82a968c6e088cdb4d099fa01448ee45e1c', 1757193820442, 1757193820443);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (7, 'pos_1757194034581_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.39, 8.39, 0, '0xdb21c9bc0c03856aebd6c00cab13b5af21aa17b10e232a7c2f1c972fa6d52873', 1757194034581, 1757194034581);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (8, 'pos_1757194052418_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.39, 8.39, 0, '0x69569728969254b3f503dde3664543c06fc959a6ab8c454793bbb29367e80442', 1757194052418, 1757194052418);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (9, 'pos_1757194549371_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.39, 8.39, 0, '0x5c8197fffe9d8606f02f6e3a3d54e994bfcb7a34335bf94a6d71f578a281c0b6', 1757194549371, 1757194549373);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (10, 'pos_1757194575320_231650994', '231650994', 'aave-usdc-base', 'Aave', 'Base', 'USDC', 1, 1, 5.11, 5.11, 0, '0x6844ddfc19174d8e3a2b5f747f039c1351afbd406cea3ab4c49d71054651cc66', 1757194575320, 1757194575320);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (11, 'pos_1757194596907_231650994', '231650994', 'compound-usdc-base', 'Compound', 'Base', 'USDC', 1, 1, 6.38, 6.38, 0, '0xf614c3db3497575326563fb4ec114c7dc5c10171b5be80e92b31115879cbc1f4', 1757194596907, 1757194596907);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (12, 'pos_1757194626772_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.39, 8.39, 0, '0x0113448511a6648a17fec4977e6398093a34d10abd55049a9ce7923a23448745', 1757194626772, 1757194626773);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (13, 'pos_1757200846320_231650994', '231650994', 'morpho-usdc-base', 'Morpho', 'Base', 'USDC', 1, 1, 8.35, 8.35, 0, '0xd87ac8a672b17b615928efadd3b7472511181d210e100a07369268981187f540', 1757200846320, 1757200846321);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (14, 'pos_1757201322672_231650994', '231650994', 'spark-usdc-base', 'Spark', 'Base', 'USDC', 1, 1, 6.61, 6.61, 0, '0x8b1ed679ef2e122b5132b1f61cc7d266a1f11e4b055cb1018a63961a065074fd', 1757201322672, 1757201322673);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (15, 'pos_1757203980266_231650994', '231650994', 'seamless-usdc-base', 'Seamless', 'Base', 'USDC', 1, 1, 7.36, 7.36, 0, '0x2d45a04efc024a879584ece1282fbd2e1775743a6c65a2f9fe9e3dda31e640ee', 1757203980266, 1757203980267);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (16, 'pos_1757204735808_231650994', '231650994', 'seamless-usdc-base', 'Seamless', 'Base', 'USDC', 1, 1, 7.36, 7.36, 0, '0x2920700518b5573ed91968a25e08add34d06309d1baffc7c777091a657756b21', 1757204735808, 1757204735808);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (17, 'pos_1757228214448_231650994', '231650994', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'Base', 'USDC', 1, 1, 7.3, 7.3, 0, '0x0eca9baa248863c1faff246d0145152d32e46dcb86c3130fc9990cba468b294f', 1757228214448, 1757228214451);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (18, 'pos_1757233840443_231650994', '231650994', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'Base', 'USDC', 1, 1, 7.31, 7.31, 0, '0x0dd5bce491c1ec9826c965d196c19429830ffa7b2d71fcf10f78c39e0429c672', 1757233840443, 1757233840443);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (19, 'pos_1757233854811_231650994', '231650994', 'spark-usdc-base', 'Spark', 'Base', 'USDC', 1, 1, 6.64, 6.64, 0, '0x8f8b8217864c060f190f551cf216d03d97068639bb02e773a21eb89fb4a14615', 1757233854811, 1757233854811);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (20, 'pos_1757276183438_231650994', '231650994', 'seamless-usdc-base', 'Seamless', 'Base', 'USDC', 1, 1, 7.38, 7.38, 0, '0xd5c3d1848eb8685f0f6c0a290edec26f812a9af9c3273240c19288dbac8736a4', 1757276183438, 1757276183438);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (21, 'pos_1757276362687_231650994', '231650994', 'seamless-usdc-base', 'Seamless', 'Base', 'USDC', 1, 1, 7.38, 7.38, 0, '0x3337ab33e29cafab1a14d96ffb8bd9e008157e5aa203d8f0247d2a502dd2a99e', 1757276362687, 1757276362688);
INSERT OR IGNORE INTO 'positions'(_rowid_, 'id', 'userId', 'poolId', 'protocol', 'chain', 'tokenSymbol', 'amountInvested', 'currentValue', 'entryApy', 'currentApy', 'yieldEarned', 'txHash', 'createdAt', 'lastUpdated') VALUES (22, 'pos_1757277974448_231650994', '231650994', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'Base', 'USDC', 1, 1, 7.31, 7.31, 0, '0x5e59ace14baec0480c80d369f2cbfbd1f16f20a6f0bbcf991227142f5bc8698e', 1757277974448, 1757277974450);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (23, '0x4d3051f769827b41ecae074127eb1ff419173c020d610c1b2fe5571ba31925bf', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'seamless-usdc-base', 'Seamless', 'USDC', '3', NULL, 'success', NULL, 1757342146207);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (24, '0x1442e3949c07e155ddedf4729eae743404209be18532bed918559ecac8cd6fea', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'USDC', '1', NULL, 'success', NULL, 1757368076504);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (25, '0xd46d5c1ef8a45a955b0c71e01b184b24a12535cf35c4ae475ae474d835cd066d', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'USDC', '1', NULL, 'success', NULL, 1757411723085);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (26, '0x1d84ac68b816c804c56455b22b6535ee6e90126b7743e2b7a9d6fb430d89871c', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'USDC', '1', NULL, 'success', NULL, 1757411755446);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (27, '0x57d8675dc460a5387d703555b4c9a2770a2595908d390af2b75f0e2660e24b98', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'USDC', '1', NULL, 'success', NULL, 1757415227175);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (28, '0xa98d73aeec8a2167dcf788884e80a1b37979a9645e500ab30c0882cfb544f872', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'fluid-usdc-base', 'Fluid', 'USDC', '1', NULL, 'success', NULL, 1757419229843);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (29, '0x4110ca8b8f87268273a7f11801d87f217c621ce5ad25db825b8658ce33ae970e', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 're7 universal usdc-usdc-base', 'Re7 Universal USDC', 'USDC', '1', NULL, 'success', NULL, 1757419660614);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (1, '0x432bff565727e9c077e60b0f53deb250e0c7766273943bdddaa3e8c3bc35e079', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'curve-usdc-crvusd-base', 'Curve', 'USDC', '1', NULL, 'success', NULL, 1757158478431);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (2, '0x746e828edc5f75d4b9db2855d4761a11d5e78535b4d3cb6fb69963580fa47862', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'curve-usdc-crvusd-base', 'Curve', 'USDC', '1', NULL, 'success', NULL, 1757159969954);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (3, '0x29ad3e074686359806b834d18ebf4d45edd3f378b86a1c209a0e8e7124ab784c', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'curve-usdc-crvusd-base', 'Curve', 'USDC', '1', NULL, 'success', NULL, 1757160446672);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (4, '0x594800d9af144869957b0cad88f0ab5ffd291a71bec613c2b8f22fd9d29eb101', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'curve-usdc-crvusd-base', 'Curve', 'USDC', '1', NULL, 'success', NULL, 1757160722711);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (5, '0x7065d93472515deeeb218aa9dd37107030799d62d3bca6f1dac19e9e55bdf637', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'curve-usdc-crvusd-base', 'Curve', 'USDC', '1', NULL, 'success', NULL, 1757161605028);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (6, '0x97eb975260e582293712be54b5949d82a968c6e088cdb4d099fa01448ee45e1c', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757193820454);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (7, '0xdb21c9bc0c03856aebd6c00cab13b5af21aa17b10e232a7c2f1c972fa6d52873', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757194034589);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (8, '0x69569728969254b3f503dde3664543c06fc959a6ab8c454793bbb29367e80442', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757194052419);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (9, '0x5c8197fffe9d8606f02f6e3a3d54e994bfcb7a34335bf94a6d71f578a281c0b6', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757194549375);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (10, '0x6844ddfc19174d8e3a2b5f747f039c1351afbd406cea3ab4c49d71054651cc66', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'aave-usdc-base', 'Aave', 'USDC', '1', NULL, 'success', NULL, 1757194575325);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (11, '0xf614c3db3497575326563fb4ec114c7dc5c10171b5be80e92b31115879cbc1f4', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'compound-usdc-base', 'Compound', 'USDC', '1', NULL, 'success', NULL, 1757194596908);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (12, '0x0113448511a6648a17fec4977e6398093a34d10abd55049a9ce7923a23448745', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757194626774);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (13, '0xd87ac8a672b17b615928efadd3b7472511181d210e100a07369268981187f540', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'morpho-usdc-base', 'Morpho', 'USDC', '1', NULL, 'success', NULL, 1757200846326);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (14, '0x8b1ed679ef2e122b5132b1f61cc7d266a1f11e4b055cb1018a63961a065074fd', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'spark-usdc-base', 'Spark', 'USDC', '1', NULL, 'success', NULL, 1757201322677);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (15, '0x2d45a04efc024a879584ece1282fbd2e1775743a6c65a2f9fe9e3dda31e640ee', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'seamless-usdc-base', 'Seamless', 'USDC', '1', NULL, 'success', NULL, 1757203980269);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (16, '0x2920700518b5573ed91968a25e08add34d06309d1baffc7c777091a657756b21', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'seamless-usdc-base', 'Seamless', 'USDC', '1', NULL, 'success', NULL, 1757204735809);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (17, '0x0eca9baa248863c1faff246d0145152d32e46dcb86c3130fc9990cba468b294f', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'USDC', '1', NULL, 'success', NULL, 1757228214455);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (18, '0x0dd5bce491c1ec9826c965d196c19429830ffa7b2d71fcf10f78c39e0429c672', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'USDC', '1', NULL, 'success', NULL, 1757233840445);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (19, '0x8f8b8217864c060f190f551cf216d03d97068639bb02e773a21eb89fb4a14615', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'spark-usdc-base', 'Spark', 'USDC', '1', NULL, 'success', NULL, 1757233854814);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (20, '0xd5c3d1848eb8685f0f6c0a290edec26f812a9af9c3273240c19288dbac8736a4', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'seamless-usdc-base', 'Seamless', 'USDC', '1', NULL, 'success', NULL, 1757276183441);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (21, '0x3337ab33e29cafab1a14d96ffb8bd9e008157e5aa203d8f0247d2a502dd2a99e', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'seamless-usdc-base', 'Seamless', 'USDC', '1', NULL, 'success', NULL, 1757276362692);
INSERT OR IGNORE INTO 'transactions'(_rowid_, 'txHash', 'userId', 'walletAddress', 'operationType', 'poolId', 'protocol', 'tokenSymbol', 'amount', 'yieldEarned', 'status', 'gasUsed', 'timestamp') VALUES (22, '0x5e59ace14baec0480c80d369f2cbfbd1f16f20a6f0bbcf991227142f5bc8698e', '231650994', '0xc8465a06cF21cB616bF152347add102C4E0D1583', 'zap', 'moonwell usdc-usdc-base', 'Moonwell USDC', 'USDC', '1', NULL, 'success', NULL, 1757277974451);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19269, 'aave', 6.16, 6.16, 0, 41735565, 1758807521566);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19270, 'fluid', 8.04, 4.35, 3.69, 22041082, 1758807521568);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19271, 'compound', 4.07, 3.11, 0.96, 2736095, 1758807521571);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19272, 'morpho', 6.43, 6.35, 0.09, 76073, 1758807521572);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19273, 'spark', 6.61, 6.61, 0, 734723075, 1758807521572);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19274, 'seamless', 7.06, 6.52, 0.53, 59659497, 1758807521573);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19275, 'moonwell', 7.15, 6.61, 0.54, 62662428, 1758807521574);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19276, 'morpho-re7', 7.66, 4.76, 2.9, 2219501, 1758807521575);
INSERT OR IGNORE INTO 'protocol_rates'(_rowid_, 'protocol', 'apy', 'apyBase', 'apyReward', 'tvlUsd', 'lastUpdated') VALUES (19284, 'highest_apy', 8.04, 8.04, 0, 0, 1758809920442);
INSERT OR IGNORE INTO 'index_tokens'(_rowid_, 'tokenId', 'symbol', 'name', 'category', 'contractAddress', 'chain', 'description', 'riskLevel', 'isActive', 'createdAt', 'lastUpdated') VALUES (1, 'blue_chip_01', 'LCAP', 'Large Cap Index', 'blue_chip', '0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8', 'base', 'Diversified basket of top crypto assets including BTC, ETH, and major altcoins', 3, 1, 1758730890000, 1758730890000);
INSERT OR IGNORE INTO 'index_tokens'(_rowid_, 'tokenId', 'symbol', 'name', 'category', 'contractAddress', 'chain', 'description', 'riskLevel', 'isActive', 'createdAt', 'lastUpdated') VALUES (2, 'defi_01', 'DEFI', 'DeFi Protocol Index', 'defi', '0x0000000000000000000000000000000000000001', 'base', 'Basket of leading DeFi protocol tokens (AAVE, UNI, COMP, etc.)', 5, 1, 1758730890000, 1758730890000);
INSERT OR IGNORE INTO 'index_tokens'(_rowid_, 'tokenId', 'symbol', 'name', 'category', 'contractAddress', 'chain', 'description', 'riskLevel', 'isActive', 'createdAt', 'lastUpdated') VALUES (3, 'emerging_01', 'EMRG', 'Emerging Protocols Index', 'emerging', '0x0000000000000000000000000000000000000002', 'base', 'High-growth potential tokens from new protocols and L2s', 8, 1, 1758730890000, 1758730890000);
INSERT OR IGNORE INTO 'index_tokens'(_rowid_, 'tokenId', 'symbol', 'name', 'category', 'contractAddress', 'chain', 'description', 'riskLevel', 'isActive', 'createdAt', 'lastUpdated') VALUES (4, 'sector_01', 'AI', 'AI & Machine Learning Index', 'sector', '0x0000000000000000000000000000000000000003', 'base', 'Tokens from AI, machine learning, and data analytics projects', 6, 1, 1758730890000, 1758730890000);
INSERT OR IGNORE INTO 'index_compositions'(_rowid_, 'id', 'indexTokenId', 'underlyingToken', 'underlyingSymbol', 'weightPercentage', 'lastUpdated') VALUES (1, 'comp_lcap_01', 'blue_chip_01', '0x4200000000000000000000000000000000000006', 'WETH', 35, 1758730890000);
INSERT OR IGNORE INTO 'index_compositions'(_rowid_, 'id', 'indexTokenId', 'underlyingToken', 'underlyingSymbol', 'weightPercentage', 'lastUpdated') VALUES (2, 'comp_lcap_02', 'blue_chip_01', '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', 'cbBTC', 30, 1758730890000);
INSERT OR IGNORE INTO 'index_compositions'(_rowid_, 'id', 'indexTokenId', 'underlyingToken', 'underlyingSymbol', 'weightPercentage', 'lastUpdated') VALUES (3, 'comp_lcap_03', 'blue_chip_01', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'USDC', 15, 1758730890000);
INSERT OR IGNORE INTO 'index_compositions'(_rowid_, 'id', 'indexTokenId', 'underlyingToken', 'underlyingSymbol', 'weightPercentage', 'lastUpdated') VALUES (4, 'comp_lcap_04', 'blue_chip_01', '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', 'DAI', 10, 1758730890000);
INSERT OR IGNORE INTO 'index_compositions'(_rowid_, 'id', 'indexTokenId', 'underlyingToken', 'underlyingSymbol', 'weightPercentage', 'lastUpdated') VALUES (5, 'comp_lcap_05', 'blue_chip_01', '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', 'cbETH', 10, 1758730890000);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (1, '0x63d34cd862bc38fc06bf72aceaa24da4aa0c1ade94e8ebde7ac4687db8ff593a', '231650994', 'blue_chip_01', 'buy', 10, 8.316236621839897536e-01, 1.202466987740373305e+01, NULL, 'success', 1758743374661);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (2, '0x84201e483df3c6f9bf96b86fb77e2ec557b31336831a471f66ecfdccbed8255c', '231650994', 'blue_chip_01', 'sell', 2.49657, 2.079059155459974384e-01, 1.200817203033193615e+01, NULL, 'success', 1758745044858);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (3, '0xf4819fcb8ebba973ed9d5d47e829bc063b01775bc4f4d9bc9a55098f0f00e123', '231650994', 'blue_chip_01', 'sell', 3.602445, 0.3, 12.00815, NULL, 'success', 1758745193250);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (4, '0xb4397d83ca0a11f3cf3972aa847ddc20f957ca178950ca7c9879aefb91226811', '231650994', 'blue_chip_01', 'sell', 1.943623, 1.618588733189961492e-01, 1.200813375346714373e+01, NULL, 'success', 1758745671179);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (5, '0x17540b493f878fdc0dd1f27dec759f1da26158850af3d1a9fc193c2d930d4385', '231650994', 'blue_chip_01', 'sell', 0.485819, 4.046471832974903732e-02, 1.200598991054469699e+01, NULL, 'success', 1758745893364);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (6, '0x0af040c040e09dd3cdb82f942181ea5fe3971bff560eec4fecab0b16b1ee15bf', '231650994', 'blue_chip_01', 'buy', 10, 8.316236621839897536e-01, 1.202466987740373305e+01, NULL, 'success', 1758746327522);
INSERT OR IGNORE INTO 'index_transactions'(_rowid_, 'txHash', 'userId', 'indexTokenId', 'operationType', 'usdcAmount', 'tokensAmount', 'pricePerToken', 'gasUsed', 'status', 'timestamp') VALUES (7, '0xb4e2e7db79419cc5160735d3c6d29b54211caea805f2d2f992dea820544c078c', '231650994', 'blue_chip_01', 'sell', 9.982322, 8.316236621839897536e-01, 1.200341266599445866e+01, NULL, 'success', 1758747868296);
INSERT OR IGNORE INTO 'migrations'('id', 'name', 'applied_at') VALUES (1, 'add-index-tables', 1758730890000);
DELETE FROM sqlite_sequence;
INSERT OR IGNORE INTO 'sqlite_sequence'(_rowid_, 'name', 'seq') VALUES (1, 'migrations', 166);
CREATE INDEX idx_positions_user ON positions(userId);
CREATE INDEX idx_transactions_user ON transactions(userId);
CREATE INDEX idx_transactions_type ON transactions(operationType);
CREATE INDEX idx_index_positions_user ON index_positions(userId);
CREATE INDEX idx_index_positions_token ON index_positions(indexTokenId);
CREATE INDEX idx_index_transactions_user ON index_transactions(userId);
CREATE INDEX idx_index_transactions_token ON index_transactions(indexTokenId);
CREATE INDEX idx_index_transactions_type ON index_transactions(operationType);
CREATE INDEX idx_index_compositions_token ON index_compositions(indexTokenId);
PRAGMA writable_schema = off;
COMMIT;
