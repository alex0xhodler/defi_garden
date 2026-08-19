/**
 * DeFi Garden Web3 Wallet Connection & EIP-712 Delegation Module
 * Handles non-custodial wallet connections (Base & Base Sepolia) and
 * Keeper Ops yield sweep authorizations.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeFiGardenWallet = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUPPORTED_CHAINS = {
    8453: {
      chainIdHex: '0x2105',
      name: 'Base Mainnet',
      rpcUrl: 'https://mainnet.base.org',
      blockExplorer: 'https://basescan.org',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    84532: {
      chainIdHex: '0x14a34',
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      blockExplorer: 'https://sepolia.basescan.org',
      nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 }
    }
  };

  var DELEGATION_TYPES = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ],
    YieldSweepDelegation: [
      { name: 'vaultAddress', type: 'address' },
      { name: 'cardDepositAddress', type: 'address' },
      { name: 'minHarvestAmount', type: 'uint256' },
      { name: 'maxFeeBps', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  function WalletController(options) {
    options = options || {};
    this.provider = options.provider || (typeof window !== 'undefined' && window.ethereum) || null;
    this.targetChainId = options.targetChainId || 8453;
    this.connectedAccount = null;
  }

  WalletController.prototype.isAvailable = function () {
    return Boolean(this.provider);
  };

  WalletController.prototype.connect = async function () {
    if (!this.provider) {
      throw new Error('No Web3 wallet provider detected. Please install Coinbase Wallet, MetaMask, or Rabby.');
    }

    var accounts = await this.provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('User rejected connection.');
    }

    this.connectedAccount = accounts[0].toLowerCase();
    await this.ensureNetwork(this.targetChainId);

    return {
      account: this.connectedAccount,
      chainId: this.targetChainId
    };
  };

  WalletController.prototype.ensureNetwork = async function (chainId) {
    if (!this.provider) return;
    var chainConfig = SUPPORTED_CHAINS[chainId];
    if (!chainConfig) {
      throw new Error('Unsupported chain ID: ' + chainId);
    }

    try {
      await this.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainConfig.chainIdHex }]
      });
    } catch (switchError) {
      // 4902 error code means the chain has not been added to the wallet
      if (switchError && (switchError.code === 4902 || switchError.code === -32603)) {
        await this.provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainConfig.chainIdHex,
            chainName: chainConfig.name,
            rpcUrls: [chainConfig.rpcUrl],
            blockExplorerUrls: [chainConfig.blockExplorer],
            nativeCurrency: chainConfig.nativeCurrency
          }]
        });
      } else {
        throw switchError;
      }
    }
  };

  /**
   * Builds an EIP-712 typed message authorizing Keeper Ops to sweep net yield to a card deposit address.
   */
  WalletController.prototype.buildDelegationPayload = function (params) {
    var chainId = params.chainId || this.targetChainId;
    return {
      types: DELEGATION_TYPES,
      domain: {
        name: 'DeFi Garden Yield Sweeper',
        version: '1',
        chainId: chainId,
        verifyingContract: params.sweeperContract || '0x0000000000000000000000000000000000008453'
      },
      primaryType: 'YieldSweepDelegation',
      message: {
        vaultAddress: params.vaultAddress,
        cardDepositAddress: params.cardDepositAddress,
        minHarvestAmount: params.minHarvestAmount || '50000000', // 50 USDC (6 decimals)
        maxFeeBps: params.maxFeeBps || 2000, // 20% max performance fee
        nonce: params.nonce || 1,
        deadline: params.deadline || (Math.floor(Date.now() / 1000) + 86400 * 30) // 30 days
      }
    };
  };

  /**
   * Request user's wallet to sign the EIP-712 yield sweep delegation.
   */
  WalletController.prototype.signDelegation = async function (params) {
    if (!this.connectedAccount) {
      await this.connect();
    }

    var payload = this.buildDelegationPayload(params);
    var signature = await this.provider.request({
      method: 'eth_signTypedData_v4',
      params: [this.connectedAccount, JSON.stringify(payload)]
    });

    return {
      signer: this.connectedAccount,
      payload: payload,
      signature: signature
    };
  };

  return {
    WalletController: WalletController,
    SUPPORTED_CHAINS: SUPPORTED_CHAINS,
    createWalletController: function (options) {
      return new WalletController(options);
    }
  };
}));
