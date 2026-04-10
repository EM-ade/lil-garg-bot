/**
 * SolanaService - NFT ownership verification with dynamic collection support
 * 
 * This service handles all Solana blockchain interactions:
 * - Verify signed messages (prove wallet ownership)
 * - Check NFT ownership for any collection (not hardcoded)
 * - Fetch NFT metadata
 * - Batch verify multiple wallets
 * 
 * Key Features:
 * - Works with any Solana NFT collection (configurable per guild)
 * - Uses Helius DAS API for efficient ownership queries
 * - Supports multiple NFTs per collection
 * - Includes creator verification for anti-spoofing
 * 
 * Security:
 * - Message signing proves wallet ownership (not just address submission)
 * - Creator address verification prevents fake collections
 */

import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import axios from 'axios';
import { config } from '../config/environment';
import logger from '../utils/logger';
import type { NftMetadata } from '../db/schema';
import type { Database } from '../db';
import { GuildConfigService } from './GuildConfigService';

export interface NftVerificationResult {
  isVerified: boolean;
  nftCount: number;
  nfts: NftMetadata[];
  walletAddress: string;
  verifiedAt: Date;
  byContract: Record<string, number>;  // Count per collection
}

export interface HeliusAsset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol?: string;
      description?: string;
      attributes?: Array<{ trait_type: string; value: string }>;
    };
    files?: Array<{ uri: string; type?: string }>;
    links?: { image?: string };
  };
  creators: Array<{
    address: string;
    verified: boolean;
    share: number;
  }>;
  grouping?: Array<{
    group_key: string;
    group_value: string;
  }>;
  collection?: {
    address: string;
    verified?: boolean;
  };
  ownership: {
    owner: string;
  };
}

export interface HeliusResponse {
  jsonrpc: '2.0';
  result: {
    items: HeliusAsset[];
    total: number;
    page: number;
    limit: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

export class SolanaService {
  private heliusApiKey: string;
  private rpcUrl: string;
  private db: Database | null = null;

  constructor(db: Database | null = null) {
    this.heliusApiKey = config.nft.heliusApiKey;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.db = db;
  }

  /**
   * Resolve the Helius API key for a guild.
   * Falls back to the global key if no per-server key is set.
   */
  async resolveHeliusApiKey(guildId: string): Promise<string> {
    if (!guildId) return this.heliusApiKey;
    
    if (!this.db) {
      return this.heliusApiKey;
    }

    try {
      const guildConfigService = new GuildConfigService(this.db);
      const guild = await guildConfigService.getGuildById(guildId);
      
      if (guild?.settings?.heliusApiKey) {
        return guild.settings.heliusApiKey;
      }
    } catch (error) {
      logger.warn(`Failed to fetch guild Helius key for ${guildId}:`, error);
    }

    return this.heliusApiKey;
  }

  /**
   * Build the RPC URL for a given API key.
   */
  buildRpcUrl(apiKey: string): string {
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  }

  /**
   * Validate Solana address format
   */
  isValidSolanaAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a verification message for wallet signing
   * 
   * This creates a unique, non-replayable message that proves
   * the user controls the wallet without requiring a transaction.
   */
  generateVerificationMessage(
    discordUserId: string,
    walletAddress: string,
    nonce?: string
  ): string {
    const timestamp = Date.now();
    const randomNonce = nonce || Math.random().toString(36).substring(2, 15);
    
    return `Discord NFT Verification
============================
Discord User ID: ${discordUserId}
Wallet Address: ${walletAddress}
Timestamp: ${timestamp}
Nonce: ${randomNonce}

Sign this message to prove you own this wallet.
This will not trigger a transaction or cost any fees.
Nonce: ${randomNonce}`;
  }

  /**
   * Verify a signed message
   * 
   * This proves that the signer controls the private key
   * for the given wallet address.
   */
  async verifySignedMessage(
    message: string,
    signature: string,
    walletAddress: string
  ): Promise<boolean> {
    try {
      // Convert message to bytes
      const messageBytes = new TextEncoder().encode(message);
      
      // Decode signature and public key
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();
      
      // Verify signature using tweetnacl
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );
      
      logger.debug(
        `[SolanaService] Message signature ${isValid ? 'valid' : 'invalid'} for ${walletAddress}`
      );
      
      return isValid;
    } catch (error) {
      logger.error('[SolanaService] Failed to verify signature:', error);
      return false;
    }
  }

  /**
   * Get all NFTs owned by a wallet address
   * 
   * Uses Helius DAS API for efficient pagination.
   * Optionally uses guild-specific Helius API key if provided.
   */
  async getNFTsByOwner(walletAddress: string, guildId?: string): Promise<HeliusAsset[]> {
    try {
      if (!this.isValidSolanaAddress(walletAddress)) {
        throw new Error(`Invalid Solana wallet address: ${walletAddress}`);
      }

      const apiKey = guildId ? await this.resolveHeliusApiKey(guildId) : this.heliusApiKey;
      const rpcUrl = this.buildRpcUrl(apiKey);

      const allNFTs: HeliusAsset[] = [];
      let page = 1;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.post<HeliusResponse>(
          rpcUrl,
          {
            jsonrpc: '2.0',
            id: `nft-ownership-${Date.now()}`,
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: walletAddress,
              page,
              limit,
              displayOptions: {
                showFungible: false,
                showNativeBalance: false,
                showInscription: false,
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,  // 10 second timeout
          }
        );

        if (response.data.error) {
          throw new Error(response.data.error.message || 'Helius API error');
        }

        const items = response.data.result.items || [];
        allNFTs.push(...items);

        // Check if there are more pages
        hasMore = items.length === limit;
        page++;

        // Rate limiting - small delay between requests
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return allNFTs;
    } catch (error) {
      logger.error('[SolanaService] Error fetching NFTs from Helius:', error);
      if (axios.isAxiosError(error)) {
        logger.error('Helius API response:', error.response?.status, error.response?.data);
      }
      throw new Error(`Failed to fetch NFTs: ${(error as Error).message}`);
    }
  }

  /**
   * Check if an NFT belongs to a specific collection
   * 
   * Uses multiple verification methods:
   * 1. Verified creator signature
   * 2. Collection grouping (DAS API)
   * 3. Collection metadata
   */
  isNftFromCollection(
    nft: HeliusAsset,
    collectionAddress: string,
    verifiedCreator?: string
  ): boolean {
    const lowerCollectionAddress = collectionAddress.toLowerCase();

    // Method 1: Check verified creator
    if (verifiedCreator) {
      const hasVerifiedCreator = nft.creators?.some(
        creator => 
          creator.address.toLowerCase() === verifiedCreator.toLowerCase() &&
          creator.verified
      );
      
      if (hasVerifiedCreator) {
        return true;
      }
    }

    // Method 2: Check collection grouping (DAS API structure)
    const isFromGrouping = nft.grouping?.some(
      group =>
        group.group_key === 'collection' &&
        group.group_value.toLowerCase() === lowerCollectionAddress
    );

    if (isFromGrouping) {
      return true;
    }

    // Method 3: Check collection field
    const isFromCollectionField = 
      nft.collection?.address?.toLowerCase() === lowerCollectionAddress ||
      nft.collection?.key?.toLowerCase() === lowerCollectionAddress;

    return isFromCollectionField;
  }

  /**
   * Get NFTs from specific collection(s) owned by a wallet
   * 
   * @param walletAddress - Wallet to check
   * @param collectionAddresses - Array of collection addresses to check
   * @param verifiedCreators - Optional map of collection -> verified creator
   * @param guildId - Optional guild ID for per-guild Helius API key
   */
  async getNFTsFromCollections(
    walletAddress: string,
    collectionAddresses: string[],
    verifiedCreators?: Record<string, string>,
    guildId?: string
  ): Promise<{
    collectionAddress: string;
    nfts: HeliusAsset[];
    count: number;
  }[]> {
    try {
      const allNFTs = await this.getNFTsByOwner(walletAddress, guildId);
      const lowerCollections = collectionAddresses.map(c => c.toLowerCase());

      // Group NFTs by collection
      const results = collectionAddresses.map(collectionAddress => {
        const lowerCollection = collectionAddress.toLowerCase();
        const verifiedCreator = verifiedCreators?.[collectionAddress];
        
        const matchingNFTs = allNFTs.filter(nft =>
          this.isNftFromCollection(nft, collectionAddress, verifiedCreator)
        );

        return {
          collectionAddress,
          nfts: matchingNFTs,
          count: matchingNFTs.length,
        };
      });

      return results;
    } catch (error) {
      logger.error('[SolanaService] Error getting NFTs from collections:', error);
      throw error;
    }
  }

  /**
   * Verify NFT ownership for multiple collections
   * 
   * This is the main verification method used by the VerificationService.
   * Supports per-guild Helius API keys when guildId is provided.
   */
  async verifyNFTOwnership(
    walletAddress: string,
    options: {
      collectionAddresses: string[];
      verifiedCreators?: Record<string, string>;
      minimumNftCounts?: Record<string, number>;  // Per-collection minimums
      guildId?: string;  // Optional guild ID for per-guild Helius API key
    }
  ): Promise<NftVerificationResult> {
    try {
      const { collectionAddresses, verifiedCreators, minimumNftCounts, guildId } = options;

      // Get NFTs from specified collections (uses guild-specific API key if provided)
      const collectionResults = await this.getNFTsFromCollections(
        walletAddress,
        collectionAddresses,
        verifiedCreators,
        guildId
      );

      // Aggregate results
      const allNfts: NftMetadata[] = [];
      const byContract: Record<string, number> = {};
      let totalNftCount = 0;

      for (const result of collectionResults) {
        byContract[result.collectionAddress] = result.count;
        totalNftCount += result.count;

        // Convert Helius assets to our NftMetadata format
        for (const nft of result.nfts) {
          allNfts.push({
            mint: nft.id,
            name: nft.content?.metadata?.name || 'Unknown NFT',
            image: nft.content?.links?.image || nft.content?.files?.[0]?.uri,
            description: nft.content?.metadata?.description,
            collection: nft.collection?.address,
            attributes: nft.content?.metadata?.attributes,
          });
        }
      }

      // Check if minimum requirements are met
      let isVerified = totalNftCount > 0;

      if (minimumNftCounts && Object.keys(minimumNftCounts).length > 0) {
        isVerified = collectionAddresses.every(collectionAddress => {
          const required = minimumNftCounts[collectionAddress] || 1;
          const owned = byContract[collectionAddress] || 0;
          return owned >= required;
        });
      }

      const verificationResult: NftVerificationResult = {
        isVerified,
        nftCount: totalNftCount,
        nfts: allNfts,
        walletAddress,
        verifiedAt: new Date(),
        byContract,
      };

      logger.info(
        `[SolanaService] NFT verification for ${walletAddress}: ` +
        `${isVerified ? 'VERIFIED' : 'NOT VERIFIED'} (${totalNftCount} NFTs, ${collectionAddresses.length} collections)`
      );

      return verificationResult;
    } catch (error) {
      logger.error('[SolanaService] Error verifying NFT ownership:', error);
      throw error;
    }
  }

  /**
   * Get detailed NFT information by mint address
   */
  async getNFTDetails(mintAddress: string): Promise<HeliusAsset | null> {
    try {
      if (!this.isValidSolanaAddress(mintAddress)) {
        throw new Error(`Invalid mint address: ${mintAddress}`);
      }

      const response = await axios.post<HeliusResponse>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          id: `nft-details-${Date.now()}`,
          method: 'getAsset',
          params: {
            id: mintAddress,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || 'Helius API error');
      }

      return response.data.result.items?.[0] || null;
    } catch (error) {
      logger.error('[SolanaService] Error fetching NFT details:', error);
      return null;
    }
  }

  /**
   * Get collection metadata from on-chain data
   */
  async getCollectionMetadata(collectionAddress: string): Promise<{
    name?: string;
    description?: string;
    image?: string;
    verifiedCreator?: string;
    totalSupply?: number;
  } | null> {
    try {
      // Try to get a sample NFT from the collection to extract metadata
      // In production, you might want to use a dedicated collection metadata API
      
      const response = await axios.post<HeliusResponse>(
        this.rpcUrl,
        {
          jsonrpc: '2.0',
          id: `collection-metadata-${Date.now()}`,
          method: 'getAssetsByCreator',
          params: {
            creatorAddress: collectionAddress,
            page: 1,
            limit: 1,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      if (response.data.error) {
        return null;
      }

      const sampleNft = response.data.result.items?.[0];
      
      if (!sampleNft) {
        return null;
      }

      return {
        name: sampleNft.content?.metadata?.name,
        description: sampleNft.content?.metadata?.description,
        image: sampleNft.content?.links?.image,
        verifiedCreator: sampleNft.creators?.find(c => c.verified)?.address,
      };
    } catch (error) {
      logger.error('[SolanaService] Error fetching collection metadata:', error);
      return null;
    }
  }

  /**
   * Batch verify multiple wallet addresses
   * 
   * Useful for admin tools or bulk re-verification.
   */
  async batchVerifyWallets(
    walletAddresses: string[],
    options: {
      collectionAddresses: string[];
      verifiedCreators?: Record<string, string>;
    }
  ): Promise<Record<string, NftVerificationResult>> {
    const results: Record<string, NftVerificationResult> = {};

    for (const walletAddress of walletAddresses) {
      try {
        const result = await this.verifyNFTOwnership(walletAddress, {
          collectionAddresses: options.collectionAddresses,
          verifiedCreators: options.verifiedCreators,
        });
        results[walletAddress] = result;

        // Rate limiting - delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        logger.error(
          `[SolanaService] Batch verification failed for ${walletAddress}:`,
          error
        );
        results[walletAddress] = {
          isVerified: false,
          nftCount: 0,
          nfts: [],
          walletAddress,
          verifiedAt: new Date(),
          byContract: {},
        };
      }
    }

    return results;
  }

  /**
   * Check if wallet owns at least one NFT from any of the specified collections
   * 
   * Optimized for quick yes/no verification.
   */
  async ownsAnyNFT(
    walletAddress: string,
    collectionAddresses: string[]
  ): Promise<boolean> {
    try {
      const result = await this.verifyNFTOwnership(walletAddress, {
        collectionAddresses,
      });
      return result.isVerified;
    } catch {
      return false;
    }
  }
}
