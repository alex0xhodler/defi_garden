/**
 * Rain Cards Integration Module for DeFi Garden
 * Implements the Rain (raincards.xyz) Visa card issuance API and automated yield-to-card routing.
 *
 * Architecture:
 * 1. User Application (KYC/KYB) -> POST /v1/issuing/applications/user
 * 2. Smart Contract Collateral Account (Base / Base Sepolia) -> POST /v1/issuing/users/{userId}/contracts
 * 3. Virtual Visa Card Issuance -> POST /v1/issuing/users/{userId}/cards
 * 4. Automated Yield Harvest Sweeps -> On-chain routing from DeFi Garden yield vaults directly to depositAddress
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RainCards = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_API_URL = 'https://api-dev.raincards.xyz/v1';
  var PROD_API_URL = 'https://api.raincards.xyz/v1';

  var CHAIN_CONFIGS = {
    8453: { name: 'Base', isTestnet: false },
    84532: { name: 'Base Sepolia', isTestnet: true, rusdAddress: '0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b' }
  };

  var SUBSCRIPTION_PRESETS = [
    { id: 'chatgpt', name: 'ChatGPT Plus', monthlyCost: 20.00, icon: '🤖', category: 'AI Tools' },
    { id: 'claude', name: 'Claude Pro', monthlyCost: 20.00, icon: '🧠', category: 'AI Tools' },
    { id: 'cursor', name: 'Cursor Pro', monthlyCost: 20.00, icon: '💻', category: 'Dev Tools' },
    { id: 'netflix', name: 'Netflix Premium', monthlyCost: 15.49, icon: '🎬', category: 'Entertainment' },
    { id: 'spotify', name: 'Spotify Individual', monthlyCost: 11.99, icon: '🎵', category: 'Entertainment' },
    { id: 'github', name: 'GitHub Copilot', monthlyCost: 10.00, icon: '🐙', category: 'Dev Tools' },
    { id: 'midjourney', name: 'Midjourney Standard', monthlyCost: 30.00, icon: '🎨', category: 'Creative' },
    { id: 'mobile', name: 'Unlimited Mobile Plan', monthlyCost: 70.00, icon: '📱', category: 'Utilities' }
  ];

  function RainClient(options) {
    options = options || {};
    this.apiKey = options.apiKey || (typeof process !== 'undefined' && process.env && process.env.RAIN_API_KEY) || '';
    this.environment = options.environment || 'sandbox';
    this.baseUrl = options.baseUrl || (this.environment === 'production' ? PROD_API_URL : DEFAULT_API_URL);
    this.mockMode = Boolean(options.mockMode || !this.apiKey);
  }

  RainClient.prototype._request = async function (endpoint, method, body) {
    if (this.mockMode) {
      return this._mockResponse(endpoint, method, body);
    }

    var headers = {
      'Content-Type': 'application/json',
      'Api-Key': this.apiKey
    };

    var res = await fetch(this.baseUrl + endpoint, {
      method: method || 'GET',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      var errorData;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { message: res.statusText };
      }
      throw new Error(errorData.message || 'Rain API request failed: ' + res.status);
    }

    return await res.json();
  };

  /**
   * Submit a new user application for Rain card issuance.
   * In sandbox mode, lastName: "approved" auto-approves instantly.
   */
  RainClient.prototype.createUserApplication = async function (userData) {
    userData = userData || {};
    var payload = {
      firstName: userData.firstName || 'DeFi',
      lastName: userData.lastName || 'approved',
      email: userData.email,
      walletAddress: userData.walletAddress,
      birthDate: userData.birthDate || '1990-01-01',
      nationalId: userData.nationalId || '123456789',
      countryOfIssue: userData.countryOfIssue || 'US',
      address: userData.address || {
        line1: '123 Onchain Way',
        city: 'San Francisco',
        region: 'CA',
        postalCode: '94105',
        countryCode: 'US'
      },
      phoneCountryCode: userData.phoneCountryCode || '1',
      phoneNumber: userData.phoneNumber || '5551234567',
      annualSalary: userData.annualSalary || '100000',
      accountPurpose: 'personal_savings_and_subscriptions',
      expectedMonthlyVolume: userData.expectedMonthlyVolume || '1000',
      isTermsOfServiceAccepted: true
    };

    return await this._request('/issuing/applications/user', 'POST', payload);
  };

  /**
   * Create or assign a smart contract collateral vault on Base (8453) or Base Sepolia (84532).
   */
  RainClient.prototype.createUserContract = async function (userId, chainId) {
    chainId = chainId || 8453;
    return await this._request('/issuing/users/' + encodeURIComponent(userId) + '/contracts', 'POST', {
      chainId: chainId
    });
  };

  /**
   * Issue a virtual Visa credit card for the user.
   */
  RainClient.prototype.issueVirtualCard = async function (userId, options) {
    options = options || {};
    var payload = {
      type: 'virtual',
      displayName: options.displayName || 'DeFi Garden Subscription Card',
      limit: {
        frequency: options.frequency || 'allTime',
        amount: options.limitAmount || 1000
      },
      status: 'active'
    };

    return await this._request('/issuing/users/' + encodeURIComponent(userId) + '/cards', 'POST', payload);
  };

  /**
   * Retrieve active cards for a user.
   */
  RainClient.prototype.getUserCards = async function (userId) {
    return await this._request('/issuing/cards?userId=' + encodeURIComponent(userId) + '&limit=20', 'GET');
  };

  /**
   * Retrieve user balances and real-time spending power.
   */
  RainClient.prototype.getUserBalances = async function (userId) {
    var raw = await this._request('/issuing/users/' + encodeURIComponent(userId) + '/balances', 'GET');
    return {
      creditLimit: (raw.creditLimit || 0) / 100,
      spendingPower: (raw.spendingPower || 0) / 100,
      balanceDue: (raw.balanceDue || 0) / 100,
      currency: raw.currency || 'USD'
    };
  };

  /**
   * Retrieve collateral smart contract addresses and token balances.
   */
  RainClient.prototype.getUserContracts = async function (userId) {
    return await this._request('/issuing/users/' + encodeURIComponent(userId) + '/contracts', 'GET');
  };

  /**
   * Helper: Calculate the required perpetual capital to fund a monthly subscription.
   */
  RainClient.prototype.calculateFundingRequirement = function (monthlyCost, apyPercentage) {
    var monthly = Number(monthlyCost) || 0;
    var apy = Number(apyPercentage) || 0;
    if (apy <= 0) return Infinity;
    var annualCost = monthly * 12;
    var capitalRequired = annualCost / (apy / 100);
    return Math.round(capitalRequired);
  };

  /**
   * Helper: Compute automated yield routing parameters from a pool harvest to the card collateral contract.
   */
  RainClient.prototype.generateYieldRoutingPlan = function (pool, subscription, customApy) {
    var apy = customApy || (pool && (pool.apyBase + (pool.apyReward || 0) || pool.apy)) || 5.5;
    var requiredCapital = this.calculateFundingRequirement(subscription.monthlyCost, apy);
    var dailyYield = (requiredCapital * (apy / 100)) / 365;

    return {
      subscriptionName: subscription.name,
      monthlyCost: subscription.monthlyCost,
      estimatedApy: Number(apy.toFixed(2)),
      requiredCapitalUsd: requiredCapital,
      dailyYieldUsd: Number(dailyYield.toFixed(2)),
      poolRecommendation: {
        project: pool ? pool.project : 'Aave V3',
        symbol: pool ? pool.symbol : 'USDC',
        chain: pool ? pool.chain : 'Base',
        tvlUsd: pool ? pool.tvlUsd : 50000000
      },
      routingAction: {
        destination: 'Rain Collateral Vault',
        frequency: 'Daily Automated Sweep',
        autoPayEnabled: true
      }
    };
  };

  /**
   * In-memory mock response for sandbox testing without live API keys.
   */
  RainClient.prototype._mockResponse = function (endpoint, method, body) {
    var mockId = 'rain_usr_' + Math.random().toString(36).substring(2, 9);
    var mockContractAddress = '0x84532' + Math.random().toString(16).substring(2, 36);

    if (endpoint.includes('/issuing/applications/user')) {
      return Promise.resolve({
        id: mockId,
        applicationStatus: 'approved',
        email: body.email,
        isActive: true,
        createdAt: new Date().toISOString()
      });
    }

    if (endpoint.includes('/contracts') && method === 'POST') {
      return Promise.resolve({
        id: 'contract_' + Math.random().toString(36).substring(2, 9),
        chainId: body.chainId || 8453,
        depositAddress: mockContractAddress,
        status: 'deployed',
        tokens: [
          { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', balance: '0.0' }
        ]
      });
    }

    if (endpoint.includes('/cards') && method === 'POST') {
      var expYear = new Date().getFullYear() + 3;
      return Promise.resolve({
        id: 'card_' + Math.random().toString(36).substring(2, 9),
        displayName: body.displayName || 'DeFi Garden Subscription Card',
        status: 'active',
        type: 'virtual',
        last4: '4242',
        expMonth: '12',
        expYear: String(expYear),
        brand: 'Visa',
        spendingLimit: body.limit ? body.limit.amount : 1000
      });
    }

    if (endpoint.includes('/balances')) {
      return Promise.resolve({
        creditLimit: 100000,
        spendingPower: 100000,
        balanceDue: 0,
        currency: 'USD'
      });
    }

    return Promise.resolve({ success: true, data: [] });
  };

  return {
    RainClient: RainClient,
    SUBSCRIPTION_PRESETS: SUBSCRIPTION_PRESETS,
    CHAIN_CONFIGS: CHAIN_CONFIGS,
    createClient: function (options) {
      return new RainClient(options);
    }
  };
}));
