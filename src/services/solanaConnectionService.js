const { Connection, PublicKey, Transaction, SystemProgram, Keypair } = require('@solana/web3.js');
const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/environment');

class SolanaConnectionService {
    constructor() {
        const rpcUrl =
            config.nft?.rpcUrl ||
            process.env.SOLANA_RPC_URL ||
            'https://api.mainnet-beta.solana.com';

        this.connection = new Connection(rpcUrl);
        this.heliusApiKey = config.nft?.heliusApiKey;
    }

    /**
     * Generate a verification message for the user to sign
     */
    generateVerificationMessage(discordId, walletAddress) {
        const baseMessage = [
            'Welcome to Lil Gargs!',
            '',
            'Please sign this message to verify your wallet ownership.',
            '',
            `Discord ID: ${discordId}`,
        ];

        if (walletAddress) {
            baseMessage.push(`Wallet: ${walletAddress}`);
        }

        baseMessage.push(`Nonce: ${Date.now()}`);

        return baseMessage.join('\n');
    }

    /**
     * Validate if a string is a valid Solana wallet address
     */
    isValidSolanaAddress(address) {
        try {
            new PublicKey(address);
            return true;
        } catch (error) {
            logger.warn(`Invalid Solana address ${address}: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify a signed message
     */
    async verifySignedMessage(message, signature, publicKey) {
        // This is a placeholder for the actual verification logic
        logger.info(`Verifying signed message for ${publicKey}`);

        // Here you would implement the actual verification using a library like @solana/web3.js
        // For example:
        // const isValid = nacl.sign.detached.verify(
        //     new TextEncoder().encode(message),
        //     new Uint8Array(signature),
        //     new PublicKey(publicKey).toBytes()
        // );

        // For now, we'll just return true as a placeholder
        return true;
    }

    /**
     * Get NFTs owned by a wallet
     */
    async getNFTsByOwner(walletAddress) {
        try {
            const response = await axios.post(
                `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`,
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
    isLilGargsNFT(nft, contractAddress) {
        // Check if the NFT has the verified creator
        const hasVerifiedCreator = nft.creators?.some(
            (creator) => creator.address === contractAddress && creator.verified
        );

        // Additional checks for collection verification
        const isFromCollection =
            nft.grouping?.some(
                (group) =>
                    group.group_key === "collection" &&
                    group.group_value === contractAddress
            ) ||
            nft.collection?.address === contractAddress ||
            nft.collection?.key === contractAddress;

        return hasVerifiedCreator || isFromCollection;
    }
}

module.exports = SolanaConnectionService;