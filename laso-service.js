/**
 * Laso.finance Virtual Visa Card & Agentic Payment Service.
 *
 * Provides CAIP-122 (SIWx) authentication, Base x402 micro-payment challenge/replay,
 * card polling, balance refresh, merchant search, and a high-fidelity simulation engine.
 *
 * UMD bundle: runs in Node.js (test harness / edge) and browser (window.LasoService).
 */
(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LasoService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Constants & Product Matrix
  // ---------------------------------------------------------------------------
  var BASE_URL = 'https://laso.finance';
  var AGENT_DOCS_URL = 'https://agents.laso.finance';
  var USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  var USDC_SOLANA_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  var PRODUCTS = {
    usa_prepaid: {
      id: 'usa_prepaid',
      name: 'USA Prepaid Visa Debit',
      description: 'Instant zero-fee issuance. US merchants only (physical delivery requires US address).',
      minAmount: 5,
      maxAmount: 1000,
      feePct: 0,
      network: 'base',
      token: 'USDC',
      endpoint: '/get-card',
      method: 'GET',
      instant: true,
      expiryMonths: 6,
      reloadable: false,
      partialAuth: false,
      binPrefix: '424288'
    },
    intl_prepaid: {
      id: 'intl_prepaid',
      name: 'International Prepaid Visa',
      description: 'Queued issuance (~24h). Accepted worldwide. Whole dollar amounts.',
      minAmount: 100,
      maxAmount: 1000,
      feePct: 0.038,
      network: 'base',
      token: 'USDC',
      endpoint: '/order-intl-card',
      method: 'GET',
      instant: false,
      expiryMonths: 6,
      reloadable: false,
      partialAuth: false,
      binPrefix: '453278'
    }
  };

  // ---------------------------------------------------------------------------
  // 2. Cryptographic & Formatting Helpers
  // ---------------------------------------------------------------------------
  function generateNonce() {
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var nonce = '';
    for (var i = 0; i < 16; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  function formatCardPan(pan) {
    if (!pan) return '';
    var clean = String(pan).replace(/\D/g, '');
    var matches = clean.match(/.{1,4}/g);
    return matches ? matches.join(' ') : clean;
  }

  function maskCardPan(pan) {
    if (!pan) return '•••• •••• •••• ••••';
    var clean = String(pan).replace(/\D/g, '');
    if (clean.length < 4) return '•••• •••• •••• ••••';
    var last4 = clean.slice(-4);
    return '•••• •••• •••• ' + last4;
  }

  function validateLuhn(pan) {
    var clean = String(pan).replace(/\D/g, '');
    if (clean.length < 13 || clean.length > 19) return false;
    var sum = 0;
    var shouldDouble = false;
    for (var i = clean.length - 1; i >= 0; i--) {
      var digit = parseInt(clean.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  function generateMockPan(prefix) {
    var p = prefix || '424288';
    var length = 16;
    var pan = String(p);
    while (pan.length < length - 1) {
      pan += Math.floor(Math.random() * 10);
    }
    // Calculate Luhn check digit
    var sum = 0;
    var shouldDouble = true;
    for (var i = pan.length - 1; i >= 0; i--) {
      var digit = parseInt(pan.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    var checkDigit = (10 - (sum % 10)) % 10;
    return pan + checkDigit;
  }

  // ---------------------------------------------------------------------------
  // 3. CAIP-122 (SIWx) & x402 Protocol Serialization
  // ---------------------------------------------------------------------------

  /**
   * Constructs standard CAIP-122 EIP-4361 Sign-In with X message.
   */
  function buildSiwxMessage(params) {
    var address = params.address || '0x0000000000000000000000000000000000000000';
    var chainId = params.chainId || 8453; // Base
    var domain = params.domain || (typeof window !== 'undefined' && window.location ? window.location.host : 'defi.garden');
    var uri = params.uri || (typeof window !== 'undefined' && window.location ? window.location.origin : 'https://defi.garden');
    var nonce = params.nonce || generateNonce();
    var issuedAt = params.issuedAt || new Date().toISOString();
    var statement = params.statement || 'Sign in with your Ethereum wallet to authenticate with Laso.finance Virtual Visa Card issuance.';

    return (
      domain + ' wants you to sign in with your Ethereum account:\n' +
      address + '\n\n' +
      statement + '\n\n' +
      'URI: ' + uri + '\n' +
      'Version: 1\n' +
      'Chain ID: ' + chainId + '\n' +
      'Nonce: ' + nonce + '\n' +
      'Issued At: ' + issuedAt
    );
  }

  /**
   * Constructs Base64 or JSON x402 payment header string.
   */
  function buildX402PaymentHeader(params) {
    var payload = {
      x402Version: 1,
      scheme: params.scheme || 'exact',
      network: params.network || 'base',
      resource: params.resource || '/get-card',
      amount: String(params.amount || '50.00'),
      asset: params.asset || 'USDC',
      payer: params.payer || params.payerAddress,
      txHash: params.txHash || null,
      timestamp: params.timestamp || new Date().toISOString(),
      signature: params.signature || null
    };

    var jsonStr = JSON.stringify(payload);
    if (typeof btoa === 'function') {
      try {
        return btoa(jsonStr);
      } catch (_e) {
        return jsonStr;
      }
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(jsonStr, 'utf8').toString('base64');
    }
    return jsonStr;
  }

  // ---------------------------------------------------------------------------
  // 4. API Client Methods
  // ---------------------------------------------------------------------------

  /**
   * Submits SIWx signature to GET /auth returning id_token and refresh_token.
   */
  function requestAuth(params) {
    var signature = params.signature;
    var message = params.message;
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var siwxHeader = JSON.stringify({
      message: message,
      signature: signature
    });

    var headers = {
      'Accept': 'application/json',
      'SIGN-IN-WITH-X': siwxHeader
    };

    return fetchFn(BASE_URL + '/auth', {
      method: 'GET',
      headers: headers
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errBody) {
          throw new Error(errBody.message || errBody.error || ('Laso auth failed with HTTP ' + res.status));
        });
      }
      return res.json();
    });
  }

  /**
   * Refreshes auth token using grant_type=refresh_token.
   */
  function refreshAuth(params) {
    var refreshToken = params.refreshToken;
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    return fetchFn(BASE_URL + '/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('Laso token refresh failed with HTTP ' + res.status);
      }
      return res.json();
    });
  }

  /**
   * Requests initial HTTP 402 challenge for a card product.
   */
  function getCardChallenge(params) {
    var amount = params.amount || 20;
    var product = params.product || 'usa_prepaid';
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var productConfig = PRODUCTS[product] || PRODUCTS.usa_prepaid;

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var url = BASE_URL + productConfig.endpoint + '?amount=' + encodeURIComponent(amount);

    return fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      if (res.status === 402) {
        return res.json().then(function (body) {
          return {
            status: 402,
            challenge: body,
            recipient: body.recipient || body.payTo || '0x49942a17fF59F13Eb6FE3725A64Eb1F985F85860',
            network: body.network || 'base',
            amount: amount,
            priceUsdc: amount,
            tokenAddress: USDC_BASE_ADDRESS
          };
        });
      }
      return res.json().then(function (body) {
        return { status: res.status, body: body };
      });
    });
  }

  /**
   * Replays GET /get-card with X-Payment and Bearer auth tokens.
   */
  function issueCardWithPayment(params) {
    var amount = params.amount || 20;
    var product = params.product || 'usa_prepaid';
    var paymentHeader = params.paymentHeader;
    var idToken = params.idToken;
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var productConfig = PRODUCTS[product] || PRODUCTS.usa_prepaid;

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var url = BASE_URL + productConfig.endpoint + '?amount=' + encodeURIComponent(amount);
    var headers = {
      'Accept': 'application/json',
      'X-Payment': paymentHeader
    };
    if (idToken) {
      headers['Authorization'] = 'Bearer ' + idToken;
    }

    return fetchFn(url, {
      method: 'GET',
      headers: headers
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          throw new Error(err.message || err.error || ('Card issuance failed with HTTP ' + res.status));
        });
      }
      return res.json();
    });
  }

  /**
   * Polls GET /get-card-data?card_id=... until status is 'ready'.
   */
  function pollCardUntilReady(params) {
    var cardId = params.cardId;
    var idToken = params.idToken;
    var onProgress = params.onProgress || function () {};
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var pollIntervalMs = params.pollIntervalMs || 2000;
    var maxWaitMs = params.maxWaitMs || 45000;
    var startTime = Date.now();

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    return new Promise(function (resolve, reject) {
      function check() {
        var elapsed = Date.now() - startTime;
        if (elapsed > maxWaitMs) {
          return reject(new Error('Card provisioning timed out after ' + Math.round(maxWaitMs / 1000) + 's. Card ID: ' + cardId));
        }

        onProgress({
          cardId: cardId,
          elapsedMs: elapsed,
          status: 'polling',
          message: 'Provisioning Visa debit card from Laso issuer network...'
        });

        var url = BASE_URL + '/get-card-data' + (cardId ? ('?card_id=' + encodeURIComponent(cardId)) : '');
        var headers = { 'Accept': 'application/json' };
        if (idToken) headers['Authorization'] = 'Bearer ' + idToken;

        fetchFn(url, { method: 'GET', headers: headers })
          .then(function (res) {
            if (!res.ok) {
              throw new Error('Failed to fetch card data: HTTP ' + res.status);
            }
            return res.json();
          })
          .then(function (data) {
            var card = data.card_details || data.card || data;
            if (card && (card.status === 'ready' || card.card_number)) {
              onProgress({
                cardId: cardId,
                status: 'ready',
                message: 'Card successfully issued and activated!'
              });
              resolve(card);
            } else {
              setTimeout(check, pollIntervalMs);
            }
          })
          .catch(function (err) {
            // Transient error retry
            if (elapsed < maxWaitMs - 5000) {
              setTimeout(check, pollIntervalMs);
            } else {
              reject(err);
            }
          });
      }

      check();
    });
  }

  /**
   * Refreshes card balance (POST /refresh-card-data).
   */
  function refreshCardBalance(params) {
    var cardId = params.cardId;
    var idToken = params.idToken;
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (idToken) headers['Authorization'] = 'Bearer ' + idToken;

    return fetchFn(BASE_URL + '/refresh-card-data', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ card_id: cardId })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          throw new Error(err.message || err.error || ('Balance refresh failed with HTTP ' + res.status));
        });
      }
      return res.json();
    });
  }

  /**
   * Searches merchant acceptance status.
   */
  function searchMerchants(params) {
    var query = params.query;
    var idToken = params.idToken;
    var fetchFn = params.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var url = BASE_URL + '/search-merchants?q=' + encodeURIComponent(query);
    var headers = { 'Accept': 'application/json' };
    if (idToken) headers['Authorization'] = 'Bearer ' + idToken;

    return fetchFn(url, {
      method: 'GET',
      headers: headers
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('Merchant search failed: HTTP ' + res.status);
      }
      return res.json();
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Local Storage & Wallet-Bound Session Management
  // ---------------------------------------------------------------------------
  var STORAGE_PREFIX = 'defi_garden_laso_';

  function getStorageKey(walletAddress, suffix) {
    var addr = (walletAddress || 'anonymous').toLowerCase();
    return STORAGE_PREFIX + addr + '_' + suffix;
  }

  function getStoredCards(walletAddress) {
    if (typeof localStorage === 'undefined') return [];
    try {
      var key = getStorageKey(walletAddress, 'cards');
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (_e) {
      return [];
    }
  }

  function saveStoredCard(walletAddress, cardData) {
    if (typeof localStorage === 'undefined' || !cardData) return;
    try {
      var cards = getStoredCards(walletAddress);
      var id = cardData.card_id || cardData.id;
      var existingIdx = -1;
      for (var i = 0; i < cards.length; i++) {
        if ((cards[i].card_id || cards[i].id) === id) {
          existingIdx = i;
          break;
        }
      }
      if (existingIdx >= 0) {
        cards[existingIdx] = Object.assign({}, cards[existingIdx], cardData);
      } else {
        cards.unshift(cardData);
      }
      var key = getStorageKey(walletAddress, 'cards');
      localStorage.setItem(key, JSON.stringify(cards));
    } catch (_e) {}
  }

  function getStoredSession(walletAddress) {
    if (typeof localStorage === 'undefined') return null;
    try {
      var key = getStorageKey(walletAddress, 'session');
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveStoredSession(walletAddress, sessionData) {
    if (typeof localStorage === 'undefined') return;
    try {
      var key = getStorageKey(walletAddress, 'session');
      localStorage.setItem(key, JSON.stringify(sessionData));
    } catch (_e) {}
  }

  // ---------------------------------------------------------------------------
  // 6. High-Fidelity Simulation Engine (for Testnet & Demos)
  // ---------------------------------------------------------------------------

  /**
   * Simulates full Laso issuance flow with authentic timeline.
   */
  function simulateIssuance(params) {
    var amount = params.amount || 20;
    var subName = params.subName || 'Claude Pro';
    var walletAddress = params.walletAddress || '0x71C...B49a';
    var onProgress = params.onProgress || function () {};

    var cardId = 'laso_' + generateNonce().slice(0, 12);
    var pan = generateMockPan('424288');
    var expMonth = '02';
    var expYear = '32';
    var cvv = String(Math.floor(100 + Math.random() * 900));

    var billingAddress = {
      name: 'DeFi Garden Alpha Member',
      address_line1: '1209 Orange St',
      address_line2: 'Suite 400',
      city: 'Wilmington',
      state: 'DE',
      postal_code: '19801',
      country: 'US'
    };

    return new Promise(function (resolve) {
      // Step 1: SIWx Signature
      onProgress({
        step: 1,
        totalSteps: 4,
        status: 'authenticating',
        message: 'Requesting CAIP-122 wallet signature (SIWx)...'
      });

      setTimeout(function () {
        // Step 2: x402 Micro-Payment
        onProgress({
          step: 2,
          totalSteps: 4,
          status: 'paying',
          message: 'Transacting $' + Number(amount).toFixed(2) + ' USDC on Base via x402...'
        });

        setTimeout(function () {
          // Step 3: Card Provisioning
          onProgress({
            step: 3,
            totalSteps: 4,
            status: 'provisioning',
            message: 'Laso BaaS issuing USA Prepaid Visa Debit card...'
          });

          setTimeout(function () {
            // Step 4: Ready
            var cardResult = {
              card_id: cardId,
              status: 'ready',
              card_number: pan,
              exp_month: expMonth,
              exp_year: expYear,
              cvv: cvv,
              available_balance: Number(amount),
              initial_amount: Number(amount),
              currency: 'USD',
              product: 'usa_prepaid',
              billing_address: billingAddress,
              subscription_name: subName,
              created_at: new Date().toISOString(),
              is_simulation: true
            };

            saveStoredCard(walletAddress, cardResult);

            onProgress({
              step: 4,
              totalSteps: 4,
              status: 'ready',
              card: cardResult,
              message: 'Virtual Visa Card ready for ' + subName + '!'
            });

            resolve(cardResult);
          }, 1200);
        }, 1000);
      }, 800);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Public API Export
  // ---------------------------------------------------------------------------
  return {
    BASE_URL: BASE_URL,
    AGENT_DOCS_URL: AGENT_DOCS_URL,
    USDC_BASE_ADDRESS: USDC_BASE_ADDRESS,
    USDC_SOLANA_MINT: USDC_SOLANA_MINT,
    PRODUCTS: PRODUCTS,

    // Helpers
    generateNonce: generateNonce,
    formatCardPan: formatCardPan,
    maskCardPan: maskCardPan,
    validateLuhn: validateLuhn,
    generateMockPan: generateMockPan,
    buildSiwxMessage: buildSiwxMessage,
    buildX402PaymentHeader: buildX402PaymentHeader,

    // Core Protocols
    requestAuth: requestAuth,
    refreshAuth: refreshAuth,
    getCardChallenge: getCardChallenge,
    issueCardWithPayment: issueCardWithPayment,
    pollCardUntilReady: pollCardUntilReady,
    refreshCardBalance: refreshCardBalance,
    searchMerchants: searchMerchants,

    // Storage
    getStoredCards: getStoredCards,
    saveStoredCard: saveStoredCard,
    getStoredSession: getStoredSession,
    saveStoredSession: saveStoredSession,

    // Simulator
    simulateIssuance: simulateIssuance
  };
});
