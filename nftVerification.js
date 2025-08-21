const axios = require("axios");
const { PublicKey } = require("@solana/web3.js");
const config = require("../config/environment");
const logger = require("../utils/logger");

class NFTVerificationService {
  constructor() {
    this.heliusApiKey = config.nft.heliusApiKey;
    this.contractAddress = config.nft.contractAddress;
    this.verifiedCreator = config.nft.verifiedCreator;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
  }

  /**
   * Validate if a string is a valid Solana wallet address
   */
  isValidSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
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
  isLilGargsNFT(nft) {
    // Check if the NFT has the verified creator (RPC API structure)
    const hasVerifiedCreator = nft.creators?.some(
      (creator) => creator.address === this.verifiedCreator && creator.verified
    );

    // Additional checks for collection verification (RPC API structure)
    const isFromCollection =
      nft.grouping?.some(
        (group) =>
          group.group_key === "collection" &&
          group.group_value === this.contractAddress
      ) ||
      nft.collection?.address === this.contractAddress ||
      nft.collection?.key === this.contractAddress;

    return hasVerifiedCreator || isFromCollection;
  }

  /**
   * Get lil-gargs NFTs owned by a wallet
   */
  async getLilGargsNFTs(walletAddress) {
    try {
      const allNFTs = await this.getNFTsByOwner(walletAddress);

      const lilGargsNFTs = allNFTs.filter((nft) => this.isLilGargsNFT(nft));

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
  async verifyNFTOwnership(walletAddress) {
    try {
      const lilGargsNFTs = await this.getLilGargsNFTs(walletAddress);

      const verificationResult = {
        isVerified: lilGargsNFTs.length > 0,
        nftCount: lilGargsNFTs.length,
        nfts: lilGargsNFTs,
        walletAddress: walletAddress,
        verifiedAt: new Date(),
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
