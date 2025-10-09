const axios = require("axios");
const { PublicKey } = require("@solana/web3.js");
const config = require("../config/environment");
const logger = require("../utils/logger");
const BotConfig = require('../database/models/BotConfig');

class NFTVerificationService {
  constructor(client) {
    this.heliusApiKey = config.nft.heliusApiKey;
    this.contractAddress = config.nft.contractAddress;
    this.verifiedCreator = config.nft.verifiedCreator;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.nftConfig = require('../config/nftConfig');
    this.client = client;
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
   * Retry helper with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
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
        const jitter = Math.random() * 500;
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
   * Get all NFTs owned by a wallet address
   */
  async getNFTsByOwner(walletAddress) {
    try {
      if (!this.isValidSolanaAddress(walletAddress)) {
        throw new Error("Invalid Solana wallet address");
      }

      const fetchNFTs = async () => {
        const response = await axios.post(
          this.rpcUrl,
          {
            jsonrpc: "2.0",
            id: "nft-verification",
            method: "getAssetsByOwner",
            params: {
              ownerAddress: walletAddress,
              page: 1,
              limit: 1000,
              displayOptions: {
                showFungible: false,
                showNativeBalance: false,
                showInscription: false,
              },
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.error) {
          throw new Error(response.data.error.message || "Helius API error");
        }

        return response.data.result?.items || [];
      };

      return await this.retryWithBackoff(fetchNFTs);
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

    const isFromCollection =
      nft.grouping?.some(
        (group) =>
          group.group_key === 'collection' &&
          group.group_value === this.contractAddress
      ) ||
      nft.collection?.address === this.contractAddress ||
      nft.collection?.key === this.contractAddress;

    return Boolean(hasVerifiedCreator || isFromCollection);
  }

  /**
   * Get lil-gargs NFTs owned by a wallet
   */
  async getLilGargsNFTs(walletAddress) {
    try {
      const allNFTs = await this.getNFTsByOwner(walletAddress);

      const lilGargsNFTs = allNFTs.filter((nft) => this.matchesDefaultConfig(nft));

      return lilGargsNFTs.map((nft) => ({
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
   */
  async verifyNFTOwnership(walletAddress, { contractAddresses, verifiedCreators } = {}) {
    try {
      const allNFTs = await this.getNFTsByOwner(walletAddress);

      const normalizedContracts = (contractAddresses || [])
        .filter(Boolean)
        .map((addr) => addr.toLowerCase());

      const normalizedCreators = (verifiedCreators || [])
        .filter(Boolean)
        .map((addr) => addr.toLowerCase());

      const matchedNFTs = [];
      const byContract = {};

      for (const nft of allNFTs) {
        const identifiers = this.extractContractIdentifiers(nft);
        const creatorMatch =
          normalizedCreators.length > 0
            ? nft.creators?.some((creator) =>
                normalizedCreators.includes(String(creator.address).toLowerCase()) &&
                creator.verified
              )
            : false;

        let contractMatch = false;
        let matchedKey = null;

        if (normalizedContracts.length > 0) {
          for (const identifier of identifiers) {
            if (normalizedContracts.includes(identifier)) {
              contractMatch = true;
              matchedKey = identifier;
              break;
            }
          }
        }

        const defaultMatch =
          normalizedContracts.length === 0 &&
          normalizedCreators.length === 0 &&
          this.matchesDefaultConfig(nft);

        if (!(contractMatch || creatorMatch || defaultMatch)) {
          continue;
        }

        matchedNFTs.push(nft);

        const key = matchedKey || (defaultMatch && this.contractAddress ? this.contractAddress.toLowerCase() : null);
        if (key) {
          byContract[key] = (byContract[key] || 0) + 1;
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
   * Get detailed NFT information by mint address
   */
  async getNFTDetails(mintAddress) {
    try {
      if (!this.isValidSolanaAddress(mintAddress)) {
        throw new Error("Invalid mint address");
      }

      const fetchDetails = async () => {
        const response = await axios.post(
          this.rpcUrl,
          {
            jsonrpc: "2.0",
            id: "nft-details",
            method: "getAsset",
            params: {
              id: mintAddress,
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.data.error) {
          throw new Error(response.data.error.message || "Helius API error");
        }

        return response.data.result;
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
