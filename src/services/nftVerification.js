const axios = require("axios");
const { PublicKey } = require("@solana/web3.js");
const config = require("../config/environment");
const logger = require("../utils/logger");
const BotConfig = require('../database/models/BotConfig');
const heliusRateLimiter = require("../utils/heliusRateLimiter");
const { getGuildVerificationConfigStore } = require('../services/serviceFactory');

class NFTVerificationService {
  constructor(client, nftCache = null) {
    this.heliusApiKey = config.nft.heliusApiKey;
    this.contractAddress = config.nft.contractAddress;
    this.verifiedCreator = config.nft.verifiedCreator;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.nftConfig = require('../config/nftConfig');
    this.client = client;
    this.nftCache = nftCache;
    this.guildConfigStore = getGuildVerificationConfigStore();
  }

  /**
   * Resolve the Helius API key for a guild.
   * Enforced: throws error if no per-server key is set (no fallback).
   */
  async resolveHeliusApiKey(guildId) {
    if (!guildId) {
      throw new Error('No guild ID provided for Helius API key resolution');
    }

    try {
      if (this.guildConfigStore) {
        const settings = await this.guildConfigStore.getGuildSettings(guildId);
        if (settings.heliusApiKey) {
          return settings.heliusApiKey;
        }
      }
    } catch (error) {
      logger.warn(`Failed to fetch guild Helius key for ${guildId}: ${error.message}`);
    }

    throw new Error(
      `This server has not configured a Helius API key for NFT verification. ` +
      'Please ask an admin to set up the Helius configuration.'
    );
  }

  /**
   * Build the RPC URL for a given API key.
   */
  buildRpcUrl(apiKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  }

  async getLogChannel(guildId) {
    try {
      const botConfig = await BotConfig.findOne({ guildId });
      return botConfig?.logChannelId || null;
    } catch (error) {
      logger.error('Error getting log channel:', error);
      return null;
    }
  }

  async sendVerificationLog(guildId, message) {
    try {
      const channelId = await this.getLogChannel(guildId);
      if (!channelId) return;

      const channel = await this.client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send(message);
      }
    } catch (error) {
      logger.error('Error sending verification log:', error);
    }
  }

  /**
   * Validate if a string is a valid Solana wallet address
   */
  isValidSolanaAddress(address) {
    try {
      logger.info(`Validating Solana address: ${address}`);
      new PublicKey(address);
      logger.info(`Address ${address} is valid`);
      return true;
    } catch (error) {
      logger.warn(`Address ${address} is invalid: ${error.message}`);
      return false;
    }
  }

  /**
   * Retry helper with exponential backoff for Helius API calls.
   * Increased defaults: maxRetries = 5, baseDelay = 2000ms.
   * Includes jitter up to 1000ms to avoid thundering herd.
   */
  async retryWithBackoff(fn, maxRetries = 5, baseDelay = 2000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isRateLimitError =
          error.response?.status === 429 ||
          error.message?.includes('429');
        
        const isLastAttempt = attempt === maxRetries;
        
        if (!isRateLimitError || isLastAttempt) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000; // Increased jitter up to 1 second
        const totalDelay = delay + jitter;
        
        logger.warn(
          `Rate limited by Helius API (attempt ${attempt + 1}/${maxRetries + 1}). ` +
          `Retrying in ${Math.round(totalDelay)}ms...`
        );
        
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }

  /**
   * Make a rate-limited Helius API call
   */
  async callHeliusApi(method, params, apiKey) {
    const key = apiKey || this.heliusApiKey;
    const rpcUrl = this.buildRpcUrl(key);
    const payload = {
      jsonrpc: "2.0",
      id: "nft-verification",
      method,
      params,
    };
    const call = async () => {
      const response = await axios.post(rpcUrl, payload, {
        headers: { "Content-Type": "application/json" },
      });
      if (response.data.error) {
        throw new Error(response.data.error.message || "Helius API error");
      }
      return response.data.result || {};
    };
    return await heliusRateLimiter.limit(call, key);
  }

  /**
   * Get all NFTs owned by a wallet address with pagination support
   */
  async getNFTsByOwner(walletAddress, apiKey) {
    try {
      if (!this.isValidSolanaAddress(walletAddress)) {
        throw new Error("Invalid Solana wallet address");
      }

      let allNFTs = [];
      let page = 1;
      let hasMore = true;
      const limit = 1000;

      while (hasMore) {
        const fetchNFTs = async () => {
          return await this.callHeliusApi("getAssetsByOwner", {
            ownerAddress: walletAddress,
            page: page,
            limit: limit,
            displayOptions: {
              showFungible: false,
              showNativeBalance: false,
              showInscription: false,
            },
          }, apiKey);
        };

        const result = await this.retryWithBackoff(fetchNFTs);
        const items = result.items || [];
        
        allNFTs = allNFTs.concat(items);
        
        logger.info(`Fetched page ${page} for wallet ${walletAddress}: ${items.length} items (total so far: ${allNFTs.length})`);
        
        // Check if there are more pages
        // Continue if we got a full page (1000 items), indicating there might be more
        hasMore = items.length === limit;
        
        if (hasMore) {
          page++;
          logger.info(`Fetching page ${page} for wallet ${walletAddress}...`);
          // Add a small delay between pages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      logger.info(`Fetched total of ${allNFTs.length} NFTs for wallet ${walletAddress} across ${page} page(s)`);
      return allNFTs;
    } catch (error) {
      logger.error("Error fetching NFTs from Helius:", error.message);
      if (error.response) {
        logger.error(
          "Helius API response:",
          error.response.status,
          error.response.data
        );
      }
      throw new Error(`Failed to fetch NFTs: ${error.message}`);
    }
  }

  /**
   * Verify if an NFT belongs to the lil-gargs collection
   */
  extractContractIdentifiers(nft) {
    const identifiers = new Set();

    if (nft.grouping) {
      for (const group of nft.grouping) {
        if (group?.group_key === 'collection' && group?.group_value) {
          identifiers.add(String(group.group_value).toLowerCase());
        }
      }
    }

    if (nft.collection?.address) {
      identifiers.add(String(nft.collection.address).toLowerCase());
    }

    if (nft.collection?.key) {
      identifiers.add(String(nft.collection.key).toLowerCase());
    }

    if (nft.mint) {
      identifiers.add(String(nft.mint).toLowerCase());
    }

    return identifiers;
  }

  matchesDefaultConfig(nft) {
    const hasVerifiedCreator = nft.creators?.some(
      (creator) =>
        this.verifiedCreator &&
        creator.address === this.verifiedCreator &&
        creator.verified
    );

    // Check multiple collection identification methods
    const collectionMatches = {
      groupingMatch: nft.grouping?.some(
        (group) =>
          group.group_key === 'collection' &&
          group.group_value === this.contractAddress
      ),
      collectionAddressMatch: nft.collection?.address === this.contractAddress,
      collectionKeyMatch: nft.collection?.key === this.contractAddress,
      // Case-insensitive matching for collection address
      collectionAddressLowerMatch: nft.collection?.address?.toLowerCase() === this.contractAddress?.toLowerCase(),
      collectionKeyLowerMatch: nft.collection?.key?.toLowerCase() === this.contractAddress?.toLowerCase()
    };

    const isFromCollection = Object.values(collectionMatches).some(Boolean);
    const matches = Boolean(hasVerifiedCreator || isFromCollection);
    
    // Debug logging for NFT matching
    logger.debug(`NFT ${nft.id} (${nft.content?.metadata?.name || 'Unknown'}) matching check:`, {
      matches,
      hasVerifiedCreator,
      collectionMatches,
      configuredCreator: this.verifiedCreator,
      configuredContract: this.contractAddress,
      nftCreators: nft.creators?.map(c => ({ address: c.address, verified: c.verified })),
      nftGrouping: nft.grouping,
      nftCollectionAddress: nft.collection?.address,
      nftCollectionKey: nft.collection?.key
    });

    return matches;
  }

  /**
   * Get lil-gargs NFTs owned by a wallet using searchAssets (more efficient)
   */
  async getLilGargsNFTs(walletAddress) {
    try {
      let allNFTs = [];
      let page = 1;
      const limit = 1000;

      while (true) {
        const fetchNFTs = async () => {
          return await this.callHeliusApi("searchAssets", {
            ownerAddress: walletAddress,
            grouping: ["collection", this.contractAddress],
            page: page,
            limit: limit,
          });
        };

        const result = await this.retryWithBackoff(fetchNFTs);
        const items = result.items || [];
        
        allNFTs = allNFTs.concat(items);
        
        logger.info(`Fetched page ${page} for Lil Gargs collection: ${items.length} items (total so far: ${allNFTs.length})`);
        
        // Continue if we got a full page
        if (items.length === limit) {
          page++;
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          break;
        }
      }

      logger.info(`Found ${allNFTs.length} Lil Gargs NFTs for wallet ${walletAddress}`);

      return allNFTs.map((nft) => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || "Unknown Lil Garg",
        image: nft.content?.links?.image || nft.content?.files?.[0]?.uri,
        description: nft.content?.metadata?.description,
        attributes: nft.content?.metadata?.attributes || [],
        collection: nft.collection,
        creators: nft.creators,
      }));
    } catch (error) {
      logger.error("Error getting lil-gargs NFTs:", error.message);
      throw error;
    }
  }

  /**
   * Verify NFT ownership for a user
   * Supports caching and per-server Helius API keys.
   * When contractAddresses are provided, uses searchAssets (more efficient).
   */
  async verifyNFTOwnership(walletAddress, { contractAddresses, verifiedCreators, guildId } = {}) {
    try {
      const apiKey = await this.resolveHeliusApiKey(guildId);
      const normalizedContracts = (contractAddresses || [])
        .filter(Boolean)
        .map((addr) => addr.toLowerCase());

      // Check cache for each contract address
      if (this.nftCache && normalizedContracts.length > 0) {
        const cachedResults = [];
        let allCached = true;

        for (const contract of normalizedContracts) {
          const cached = await this.nftCache.get(guildId, walletAddress, contract);
          if (cached) {
            cachedResults.push(cached);
          } else {
            allCached = false;
          }
        }

        if (allCached && cachedResults.length > 0) {
          logger.info(`Cache hit for all contracts for wallet ${walletAddress} in guild ${guildId}`);
          return this.mergeCachedResults(cachedResults, walletAddress);
        }
      }

      let matchedNFTs = [];
      const byContract = {};

      // Use searchAssets for each contract (more efficient than getAssetsByOwner)
      if (normalizedContracts.length > 0) {
        for (const contract of normalizedContracts) {
          const nfts = await this.getNFTsBySearch(walletAddress, contract, apiKey);
          matchedNFTs = matchedNFTs.concat(nfts);
          byContract[contract] = nfts.length;

          // Cache result for this contract
          if (this.nftCache && guildId) {
            await this.nftCache.set(guildId, walletAddress, contract, {
              nfts,
              count: nfts.length,
              contract,
            });
          }
        }
      } else {
        // Fallback: fetch ALL NFTs and filter client-side
        const allNFTs = await this.getNFTsByOwner(walletAddress, apiKey);
        logger.info(`Verifying NFT ownership for ${walletAddress}: ${allNFTs.length} total NFTs fetched`);

        const normalizedCreators = (verifiedCreators || [])
          .filter(Boolean)
          .map((addr) => addr.toLowerCase());

        for (const nft of allNFTs) {
          const identifiers = this.extractContractIdentifiers(nft);
          const creatorMatch =
            normalizedCreators.length > 0
              ? nft.creators?.some((creator) =>
                  normalizedCreators.includes(String(creator.address).toLowerCase()) &&
                  creator.verified
                )
              : false;

          const defaultMatch = this.matchesDefaultConfig(nft);

          if (!(creatorMatch || defaultMatch)) {
            continue;
          }

          matchedNFTs.push(nft);

          const key = defaultMatch && this.contractAddress ? this.contractAddress.toLowerCase() : null;
          if (key) {
            byContract[key] = (byContract[key] || 0) + 1;
          }
        }
      }

      const preparedNFTs = matchedNFTs.map((nft) => ({
        mint: nft.id,
        name: nft.content?.metadata?.name || 'Unknown NFT',
        image: nft.content?.links?.image || nft.content?.files?.[0]?.uri,
        description: nft.content?.metadata?.description,
        attributes: nft.content?.metadata?.attributes || [],
        collection: nft.collection,
        creators: nft.creators,
      }));

      const verificationResult = {
        isVerified: preparedNFTs.length > 0,
        nftCount: preparedNFTs.length,
        nfts: preparedNFTs,
        walletAddress: walletAddress,
        verifiedAt: new Date(),
        byContract,
      };

      logger.info(
        `NFT verification for ${walletAddress}: ${
          verificationResult.isVerified ? "VERIFIED" : "NOT VERIFIED"
        } (${verificationResult.nftCount} NFTs)`
      );

      return verificationResult;
    } catch (error) {
      logger.error("Error verifying NFT ownership:", error.message);
      throw error;
    }
  }

  /**
   * Merge cached results into a single verification result.
   */
  mergeCachedResults(cachedResults, walletAddress) {
    const allNFTs = [];
    const byContract = {};

    for (const cached of cachedResults) {
      allNFTs.push(...cached.nfts);
      byContract[cached.contract] = cached.count;
    }

    return {
      isVerified: allNFTs.length > 0,
      nftCount: allNFTs.length,
      nfts: allNFTs,
      walletAddress: walletAddress,
      verifiedAt: new Date(),
      byContract,
      fromCache: true,
    };
  }

  /**
   * Search for NFTs by collection using searchAssets (efficient).
   */
  async getNFTsBySearch(walletAddress, contractAddress, apiKey) {
    try {
      let allNFTs = [];
      let page = 1;
      const limit = 1000;

      while (true) {
        const fetchNFTs = async () => {
          return await this.callHeliusApi("searchAssets", {
            ownerAddress: walletAddress,
            grouping: ["collection", contractAddress],
            page: page,
            limit: limit,
          }, apiKey);
        };

        const result = await this.retryWithBackoff(fetchNFTs);
        const items = result.items || [];

        allNFTs = allNFTs.concat(items);

        if (items.length < limit) break;

        page++;
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return allNFTs;
    } catch (error) {
      logger.error(`Error searching assets for contract ${contractAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Get detailed NFT information by mint address
   */
  async getNFTDetails(mintAddress) {
    try {
      if (!this.isValidSolanaAddress(mintAddress)) {
        throw new Error("Invalid mint address");
      }

      const fetchDetails = async () => {
        return await this.callHeliusApi("getAsset", {
          id: mintAddress,
        });
      };

      return await this.retryWithBackoff(fetchDetails);
    } catch (error) {
      logger.error("Error fetching NFT details:", error.message);
      throw new Error(`Failed to fetch NFT details: ${error.message}`);
    }
  }

  /**
   * Batch verify multiple wallet addresses
   */
  async batchVerifyWallets(walletAddresses) {
    const results = [];

    for (const walletAddress of walletAddresses) {
      try {
        const result = await this.verifyNFTOwnership(walletAddress);
        results.push(result);

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          isVerified: false,
          nftCount: 0,
          nfts: [],
          walletAddress: walletAddress,
          error: error.message,
          verifiedAt: new Date(),
        });
      }
    }

    return results;
  }
}

module.exports = NFTVerificationService;
