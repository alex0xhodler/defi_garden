/**
 * Pure, network/Worker-free core for Laso.finance Virtual Visa Card rails & agent tools.
 * CommonJS format matching edge/api-core.js and edge/mcp-core.js.
 */

'use strict';

const lasoService = require('../laso-service.js');

const LASO_RAILS = {
  service: 'Laso.finance Virtual Visa Cards',
  docs_url: 'https://agents.laso.finance',
  network: 'Base (CAIP-2 eip155:8453) & Solana',
  payment_protocol: 'x402 (HTTP 402 Payment Required)',
  authentication: 'CAIP-122 Sign-In with X (SIWx)',
  products: {
    usa_prepaid: {
      name: 'USA Prepaid Visa Debit',
      load_fee_pct: 0,
      limits: { min_usd: 5, max_usd: 1000 },
      settlement_speed: 'Instant (~7-10s)',
      merchant_scope: 'US merchants only (physical delivery requires US address)',
      reloadable: false,
      partial_auth: false,
      expiration: '6 months from issuance',
      unspent_balance_rule: 'Forfeited after 6 months; spend full amount'
    },
    intl_prepaid: {
      name: 'International Prepaid Visa',
      load_fee_pct: 3.8,
      limits: { min_usd: 100, max_usd: 1000 },
      settlement_speed: 'Queued (up to ~24h)',
      merchant_scope: 'Worldwide Visa merchants',
      reloadable: false,
      expiration: '6 months from issuance'
    }
  }
};

function handleLasoRailsRequest() {
  return {
    status: 200,
    body: Object.assign({}, LASO_RAILS, {
      timestamp: new Date().toISOString()
    })
  };
}

function handleLasoIssueCardRequest(params) {
  const p = params || {};
  const amount = Number(p.amount) || 20;
  const product = p.product || 'usa_prepaid';
  const productDef = lasoService.PRODUCTS[product] || lasoService.PRODUCTS.usa_prepaid;

  if (amount < productDef.minAmount || amount > productDef.maxAmount) {
    return {
      status: 400,
      body: {
        error: 'Amount $' + amount + ' is outside valid bounds ($' + productDef.minAmount + '–$' + productDef.maxAmount + ') for ' + productDef.name,
        valid_range: { min: productDef.minAmount, max: productDef.maxAmount }
      }
    };
  }

  // If simulation mode or test request
  if (p.simulation !== false) {
    const cardId = 'laso_sim_' + lasoService.generateNonce().slice(0, 10);
    const pan = lasoService.generateMockPan(productDef.binPrefix);
    return {
      status: 200,
      body: {
        success: true,
        simulation: true,
        card_id: cardId,
        status: 'ready',
        product: product,
        card_details: {
          card_number: pan,
          exp_month: '02',
          exp_year: '32',
          cvv: '942',
          available_balance: amount,
          currency: 'USD',
          billing_address: {
            name: 'DeFi Garden Agent',
            address_line1: '1209 Orange St',
            address_line2: 'Suite 400',
            city: 'Wilmington',
            state: 'DE',
            postal_code: '19801',
            country: 'US'
          }
        },
        payment_info: {
          network: 'base',
          asset: 'USDC',
          amount_paid: amount,
          fee_paid: (amount * productDef.feePct)
        },
        notice: 'USA Prepaid cards are valid for 6 months at US merchants only. Non-reloadable.'
      }
    };
  }

  // Live mode specification
  return {
    status: 402,
    body: {
      x402Version: 1,
      network: 'base',
      recipient: '0x49942a17fF59F13Eb6FE3725A64Eb1F985F85860',
      asset: 'USDC',
      amount: String(amount),
      endpoint: productDef.endpoint,
      instruction: 'Submit onchain USDC transfer on Base to recipient with x402 payment header.'
    }
  };
}

function handleLasoGetCardRequest(params) {
  const p = params || {};
  const cardId = p.card_id;
  if (!cardId) {
    return {
      status: 400,
      body: { error: 'Missing required parameter card_id' }
    };
  }

  if (p.simulation !== false || cardId.indexOf('laso_sim_') === 0) {
    return {
      status: 200,
      body: {
        success: true,
        card_id: cardId,
        status: 'ready',
        available_balance: 24.00,
        currency: 'USD',
        card_number: '4242 8849 1920 8842',
        exp_month: '02',
        exp_year: '32',
        cvv: '942',
        billing_address: {
          name: 'DeFi Garden Member',
          address_line1: '1209 Orange St',
          city: 'Wilmington',
          state: 'DE',
          postal_code: '19801',
          country: 'US'
        }
      }
    };
  }

  return {
    status: 200,
    body: {
      card_id: cardId,
      status: 'pending',
      poll_endpoint: 'https://laso.finance/get-card-data?card_id=' + encodeURIComponent(cardId)
    }
  };
}

function handleLasoSearchMerchantsRequest(params) {
  const p = params || {};
  const query = (p.query || '').toLowerCase().trim();
  if (!query) {
    return {
      status: 400,
      body: { error: 'Missing required search query' }
    };
  }

  // Known US online merchants
  const KNOWN_ACCEPTED = [
    'amazon', 'claude', 'anthropic', 'openai', 'chatgpt', 'cursor', 'spotify',
    'netflix', 'aws', 'amazon web services', 'github', 'youtube', 'google',
    'apple', 'hulu', 'disney', 'max', 'uber', 'doordash', 'walmart', 'audible'
  ];

  let isAccepted = false;
  for (let i = 0; i < KNOWN_ACCEPTED.length; i++) {
    if (query.indexOf(KNOWN_ACCEPTED[i]) >= 0 || KNOWN_ACCEPTED[i].indexOf(query) >= 0) {
      isAccepted = true;
      break;
    }
  }

  return {
    status: 200,
    body: {
      query: p.query,
      status: isAccepted ? 'accepted' : 'unknown',
      merchant_type: 'US Online / Subscription',
      rules: 'Card accepted at US checkout. Billing address must be in the United States.'
    }
  };
}

module.exports = {
  LASO_RAILS: LASO_RAILS,
  handleLasoRailsRequest: handleLasoRailsRequest,
  handleLasoIssueCardRequest: handleLasoIssueCardRequest,
  handleLasoGetCardRequest: handleLasoGetCardRequest,
  handleLasoSearchMerchantsRequest: handleLasoSearchMerchantsRequest
};
