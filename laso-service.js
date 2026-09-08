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

  function getBaseUrl() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin + '/api/laso';
    }
    return BASE_URL;
  }

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
  function generateHexNonce(numBytes) {
    var b = numBytes || 32;
    var hex = '';
    var chars = '0123456789abcdef';
    for (var i = 0; i < b * 2; i++) {
      hex += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hex;
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
  /**
   * Constructs EIP-712 typed data message for Base USDC TransferWithAuthorization (EIP-3009).
   */
  function buildEip712TransferWithAuthorization(params) {
    var p = params || {};
    var from = p.from;
    var to = p.to || '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37';
    var amount = Number(p.amount || 5);
    var valueUnits = String(Math.round(amount * 1e6));
    var validAfter = Number(p.validAfter || 0);
    var validBefore = Number(p.validBefore || (Math.floor(Date.now() / 1000) + 3600));
    var nonce = p.nonce || ('0x' + generateHexNonce(32));

    var domain = {
      name: 'USD Coin',
      version: '2',
      chainId: 8453,
      verifyingContract: USDC_BASE_ADDRESS
    };

    var types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    var message = {
      from: from,
      to: to,
      value: valueUnits,
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce
    };

    return {
      domain: domain,
      types: types,
      primaryType: 'TransferWithAuthorization',
      message: message
    };
  }

  /**
   * Constructs x402 v2 payment header string (EIP-3009 payload for Base USDC).
   */
  function buildX402PaymentHeaderV2(params) {
    var p = params || {};
    var payload = {
      x402Version: 2,
      scheme: 'exact',
      network: 'eip155:8453',
      payload: {
        signature: p.signature,
        authorization: {
          from: p.from,
          to: p.to,
          value: String(p.value),
          validAfter: Number(p.validAfter || 0),
          validBefore: Number(p.validBefore),
          nonce: p.nonce
        }
      }
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
    var p = params || {};
    var amount = p.amount || 5;
    var product = p.product || 'usa_prepaid';
    var fetchFn = p.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var productConfig = PRODUCTS[product] || PRODUCTS.usa_prepaid;
    var baseUrl = p.baseUrl || getBaseUrl();

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var url = baseUrl + productConfig.endpoint + '?amount=' + encodeURIComponent(amount);

    return fetchFn(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      if (res.status === 402) {
        var prHeader = null;
        if (res.headers) {
          if (typeof res.headers.get === 'function') {
            prHeader = res.headers.get('payment-required') || res.headers.get('PAYMENT-REQUIRED');
          } else if (res.headers['payment-required']) {
            prHeader = res.headers['payment-required'];
          }
        }

        var challengeData = null;
        if (prHeader) {
          try {
            var decodedStr = typeof atob === 'function' ? atob(prHeader) : Buffer.from(prHeader, 'base64').toString('utf8');
            challengeData = JSON.parse(decodedStr);
          } catch (_e) {}
        }

        return res.json().catch(function () { return {}; }).then(function (body) {
          var challenge = challengeData || body;
          var accepts = challenge && challenge.accepts ? challenge.accepts : [];
          var baseOption = null;
          for (var i = 0; i < accepts.length; i++) {
            if (accepts[i].network === 'eip155:8453' || accepts[i].network === 'base') {
              baseOption = accepts[i];
              break;
            }
          }

          var recipient = (baseOption && baseOption.payTo) || challenge.recipient || challenge.payTo || '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37';
          var rawAmount = (baseOption && baseOption.amount) ? (Number(baseOption.amount) / 1e6) : amount;

          return {
            status: 402,
            challenge: challenge,
            baseOption: baseOption,
            x402Version: challenge.x402Version || 2,
            recipient: recipient,
            payTo: recipient,
            network: challenge.network || (baseOption && baseOption.network) || 'base',
            caip2Network: (baseOption && baseOption.network) || 'eip155:8453',
            amount: rawAmount,
            priceUsdc: rawAmount,
            tokenAddress: (baseOption && baseOption.asset) || USDC_BASE_ADDRESS,
            rawChallengeHeader: prHeader
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
    var p = params || {};
    var amount = p.amount || 5;
    var product = p.product || 'usa_prepaid';
    var paymentHeader = p.paymentHeader;
    var idToken = p.idToken;
    var fetchFn = p.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var productConfig = PRODUCTS[product] || PRODUCTS.usa_prepaid;
    var baseUrl = p.baseUrl || getBaseUrl();

    if (!fetchFn) {
      return Promise.reject(new Error('Fetch API is not available'));
    }

    var url = baseUrl + productConfig.endpoint + '?amount=' + encodeURIComponent(amount);
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
    var p = params || {};
    var cardId = p.cardId;
    var idToken = p.idToken;
    var onProgress = p.onProgress || function () {};
    var fetchFn = p.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var baseUrl = p.baseUrl || getBaseUrl();
    var pollIntervalMs = p.pollIntervalMs || 2000;
    var maxWaitMs = p.maxWaitMs || 45000;
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
          message: 'Provisioning Visa debit card from Laso issuer network (' + Math.round(elapsed / 1000) + 's)...'
        });

        var url = baseUrl + '/get-card-data' + (cardId ? ('?card_id=' + encodeURIComponent(cardId)) : '');
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
            if (data.status === 'ready' && data.card_details) {
              card = Object.assign({}, data.card_details, {
                card_id: data.card_id || cardId,
                status: 'ready',
                usd_amount: data.usd_amount
              });
            }
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
  // 6.1 Web3 Wallet & Live x402 Card Issuance Engine
  // ---------------------------------------------------------------------------

  /**
   * Connects to injected Ethereum wallet (window.ethereum) and returns selected account.
   */
  function connectEthereumWallet() {
    if (typeof window === 'undefined' || !window.ethereum) {
      return Promise.reject(new Error('No Ethereum wallet detected. Please install or open MetaMask, Coinbase Wallet, or Rabby.'));
    }

    return window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        if (!accounts || !accounts.length) {
          throw new Error('No accounts authorized from wallet.');
        }
        return accounts[0];
      });
  }

  /**
   * Ensures wallet is connected to Base mainnet (Chain ID 8453 / 0x2105).
   */
  function ensureBaseNetwork() {
    if (typeof window === 'undefined' || !window.ethereum) {
      return Promise.reject(new Error('No Ethereum wallet detected.'));
    }

    return window.ethereum.request({ method: 'eth_chainId' })
      .then(function (chainIdHex) {
        if (chainIdHex && (chainIdHex.toLowerCase() === '0x2105' || chainIdHex === '8453' || parseInt(chainIdHex, 16) === 8453)) {
          return true;
        }

        return window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }]
        }).catch(function (switchError) {
          if (switchError && (switchError.code === 4902 || (switchError.message && switchError.message.indexOf('Unrecognized chain') >= 0))) {
            return window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105',
                chainName: 'Base',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org']
              }]
            });
          }
          throw switchError;
        }).then(function () {
          return true;
        });
      });
  }

  /**
   * Checks USDC balance on Base using direct eth_call to balanceOf(address).
   */
  function checkBaseUsdcBalance(walletAddress) {
    if (typeof window === 'undefined' || !window.ethereum) {
      return Promise.reject(new Error('No Ethereum wallet detected.'));
    }

    var cleanAddr = String(walletAddress).replace(/^0x/, '').toLowerCase();
    while (cleanAddr.length < 64) {
      cleanAddr = '0' + cleanAddr;
    }
    var callData = '0x70a08231' + cleanAddr;

    return window.ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: USDC_BASE_ADDRESS,
          data: callData
        },
        'latest'
      ]
    }).then(function (rawHex) {
      if (!rawHex || rawHex === '0x') return 0;
      try {
        var bigVal = BigInt(rawHex);
        return Number(bigVal) / 1e6;
      } catch (_e) {
        var dec = parseInt(rawHex, 16);
        return isNaN(dec) ? 0 : (dec / 1e6);
      }
    }).catch(function (_err) {
      return 0;
    });
  }

  /**
   * Prompts user to sign EIP-712 TransferWithAuthorization using eth_signTypedData_v4.
   */
  function signTransferAuthorization(walletAddress, typedData) {
    if (typeof window === 'undefined' || !window.ethereum) {
      return Promise.reject(new Error('No Ethereum wallet detected.'));
    }

    var payloadStr = JSON.stringify(typedData);
    return window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [walletAddress, payloadStr]
    });
  }

  /**
   * Complete live issuance flow:
   * 1. Connect wallet & switch to Base network.
   * 2. Verify USDC balance >= amount.
   * 3. Fetch 402 payment challenge from Laso.
   * 4. Prompt EIP-712 signature in wallet (gasless onchain execution via Coinbase facilitator).
   * 5. Submit X-Payment header to /get-card.
   * 6. Poll /get-card-data until status is ready (~7-10s).
   * 7. Save sanitized metadata to localStorage and return full card in memory.
   */
  function issueCardWithLiveWallet(params) {
    var p = params || {};
    var amount = Number(p.amount) || 5;
    if (amount < 5) amount = 5;
    var subName = p.subName || 'Subscription';
    var onProgress = p.onProgress || function () {};

    var userAccount = null;
    var idToken = null;
    var pendingCardId = null;

    return connectEthereumWallet()
      .then(function (account) {
        userAccount = account;
        onProgress({
          step: 1,
          totalSteps: 5,
          status: 'switching_network',
          message: 'Connected wallet ' + account.slice(0, 6) + '...' + account.slice(-4) + '. Checking Base network...'
        });
        return ensureBaseNetwork();
      })
      .then(function () {
        onProgress({
          step: 2,
          totalSteps: 5,
          status: 'checking_balance',
          message: 'Checking Base USDC balance for $' + amount.toFixed(2) + ' payment...'
        });
        return checkBaseUsdcBalance(userAccount);
      })
      .then(function (balance) {
        if (balance < amount) {
          throw new Error('Insufficient USDC on Base. Required: $' + amount.toFixed(2) + ', Available: $' + balance.toFixed(2) + '. Please top up your wallet with USDC on Base.');
        }

        onProgress({
          step: 3,
          totalSteps: 5,
          status: 'requesting_challenge',
          message: 'Requesting x402 payment challenge for $' + amount.toFixed(2) + ' Visa card...'
        });
        return getCardChallenge({ amount: amount, product: 'usa_prepaid' });
      })
      .then(function (challengeRes) {
        if (challengeRes.status !== 402) {
          throw new Error('Expected 402 challenge, received status ' + challengeRes.status);
        }

        var payTo = challengeRes.recipient || challengeRes.payTo || '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37';
        var typedData = buildEip712TransferWithAuthorization({
          from: userAccount,
          to: payTo,
          amount: amount
        });

        onProgress({
          step: 4,
          totalSteps: 5,
          status: 'signing',
          message: 'Please sign gasless USDC authorization in your wallet...'
        });

        return signTransferAuthorization(userAccount, typedData).then(function (signature) {
          return {
            signature: signature,
            typedData: typedData,
            payTo: payTo
          };
        });
      })
      .then(function (signedResult) {
        var paymentHeader = buildX402PaymentHeaderV2({
          signature: signedResult.signature,
          from: userAccount,
          to: signedResult.payTo,
          value: signedResult.typedData.message.value,
          validAfter: signedResult.typedData.message.validAfter,
          validBefore: signedResult.typedData.message.validBefore,
          nonce: signedResult.typedData.message.nonce
        });

        onProgress({
          step: 5,
          totalSteps: 5,
          status: 'issuing',
          message: 'Submitting x402 payment to Laso issuer rail...'
        });

        return issueCardWithPayment({
          amount: amount,
          product: 'usa_prepaid',
          paymentHeader: paymentHeader
        });
      })
      .then(function (orderRes) {
        var cardOrder = orderRes.card || orderRes;
        pendingCardId = cardOrder.card_id || cardOrder.id;
        idToken = (orderRes.auth && orderRes.auth.id_token) || null;

        // Cache pending card metadata immediately so user never loses order state
        var pendingCardData = {
          card_id: pendingCardId,
          status: 'pending',
          last4: 'pending',
          available_balance: amount,
          initial_amount: amount,
          subscription_name: subName,
          wallet_address: userAccount,
          id_token: idToken,
          created_at: new Date().toISOString(),
          is_simulation: false
        };
        saveStoredCard(userAccount, pendingCardData);

        onProgress({
          step: 5,
          totalSteps: 5,
          status: 'provisioning',
          message: 'Order accepted (' + pendingCardId + '). Provisioning Visa card from network...'
        });

        return pollCardUntilReady({
          cardId: pendingCardId,
          idToken: idToken,
          onProgress: function (p) {
            onProgress({
              step: 5,
              totalSteps: 5,
              status: 'provisioning',
              message: p.message
            });
          }
        });
      })
      .then(function (cardDetails) {
        // Zero PAN / CVV stored in localStorage!
        var safeMetadata = {
          card_id: pendingCardId,
          status: 'ready',
          last4: cardDetails.card_number ? String(cardDetails.card_number).slice(-4) : '8842',
          exp_month: cardDetails.exp_month || '02',
          exp_year: cardDetails.exp_year || '32',
          available_balance: cardDetails.available_balance || amount,
          initial_amount: amount,
          currency: cardDetails.currency || 'USD',
          product: 'usa_prepaid',
          billing_address: cardDetails.billing_address || {
            name: 'Laso Finance',
            line_1: '440 N Barranca Avenue',
            line_2: '#4496',
            city: 'Covina',
            state: 'CA',
            zip: '91723',
            country: 'US'
          },
          subscription_name: subName,
          wallet_address: userAccount,
          id_token: idToken,
          created_at: new Date().toISOString(),
          is_simulation: false
        };

        saveStoredCard(userAccount, safeMetadata);

        // Return full card in volatile memory for active session
        return Object.assign({}, safeMetadata, {
          card_number: cardDetails.card_number,
          cvv: cardDetails.cvv
        });
      });
  }

  /**
   * On-demand cryptographic card reveal via SIWx:
   * Re-authenticates via wallet signature to pull fresh PAN, CVV, and balance
   * directly from Laso's PCI-compliant vault into volatile React memory.
   */
  function revealCardWithSiwx(params) {
    var p = params || {};
    var cardId = p.cardId;
    var fetchFn = p.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var baseUrl = p.baseUrl || getBaseUrl();

    if (!cardId) {
      return Promise.reject(new Error('Missing required cardId'));
    }

    return connectEthereumWallet().then(function (account) {
      var msg = buildSiwxMessage({
        address: account,
        statement: 'Sign in with your Ethereum account to reveal your Laso.finance Virtual Visa Card credentials.'
      });

      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('No Ethereum wallet available for SIWx signature.');
      }

      return window.ethereum.request({
        method: 'personal_sign',
        params: [msg, account]
      }).then(function (signature) {
        return requestAuth({
          message: msg,
          signature: signature,
          fetchFn: fetchFn
        }).then(function (authRes) {
          var idToken = authRes.auth && authRes.auth.id_token;
          if (!idToken) throw new Error('Authentication succeeded but no id_token was returned.');

          saveStoredSession(account, authRes);

          var url = baseUrl + '/get-card-data?card_id=' + encodeURIComponent(cardId);
          return fetchFn(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer ' + idToken
            }
          }).then(function (res) {
            if (!res.ok) throw new Error('Failed to retrieve card data: HTTP ' + res.status);
            return res.json();
          }).then(function (data) {
            var details = data.card_details || data.card || data;
            return Object.assign({}, details, {
              card_id: data.card_id || cardId,
              status: data.status || 'ready',
              available_balance: details.available_balance || data.usd_amount
            });
          });
        });
      });
    });
  }

  /**
   * Fetches single-use dashboard login link for the authenticated user.
   */
  function getLasoDashboardUrl(params) {
    var p = params || {};
    var idToken = p.idToken;
    var fetchFn = p.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    var baseUrl = p.baseUrl || getBaseUrl();

    if (!idToken) {
      return Promise.reject(new Error('Missing required idToken for dashboard link'));
    }

    var url = baseUrl + '/get-auth-link';
    return fetchFn(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + idToken
      }
    }).then(function (res) {
      if (!res.ok) throw new Error('Failed to fetch auth link: HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      return data.auth_url || data.url;
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
    buildX402PaymentHeaderV2: buildX402PaymentHeaderV2,
    buildEip712TransferWithAuthorization: buildEip712TransferWithAuthorization,
    generateHexNonce: generateHexNonce,
    getBaseUrl: getBaseUrl,

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

    // Web3 Wallet & Live Engine
    connectEthereumWallet: connectEthereumWallet,
    ensureBaseNetwork: ensureBaseNetwork,
    checkBaseUsdcBalance: checkBaseUsdcBalance,
    signTransferAuthorization: signTransferAuthorization,
    issueCardWithLiveWallet: issueCardWithLiveWallet,
    revealCardWithSiwx: revealCardWithSiwx,
    getLasoDashboardUrl: getLasoDashboardUrl,

    // Simulator
    simulateIssuance: simulateIssuance
  };
});
