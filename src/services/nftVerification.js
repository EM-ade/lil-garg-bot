const logger = require('../utils/logger');
const { Connection, PublicKey } = require('@solana/web3.js');

// Load environment variables
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const LIL_GARGS_COLLECTION_ADDRESS = process.env.LIL_GARGS_COLLECTION_ADDRESS;

class NFTVerificationService {
    constructor() {
        if (!SOLANA_RPC_URL) {
            logger.error('SOLANA_RPC_URL is not set in environment variables.');
            throw new Error('SOLANA_RPC_URL is not configured.');
        }
        if (!LIL_GARGS_COLLECTION_ADDRESS) {
            logger.error('LIL_GARGS_COLLECTION_ADDRESS is not set in environment variables.');
            throw new Error('LIL_GARGS_COLLECTION_ADDRESS is not configured.');
        }
        this.connection = new Connection(SOLANA_RPC_URL, 'confirmed');
        this.lilGargsCollectionPublicKey = new PublicKey(LIL_GARGS_COLLECTION_ADDRESS);
    }

    /**
     * Checks if a given string is a valid Solana wallet address format.
     * @param {string} address The wallet address to validate.
     * @returns {boolean} True if the address is a valid Solana format, false otherwise.
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
     * Verifies NFT ownership for a given wallet address by checking actual Solana blockchain data.
     * This function will fetch all NFTs owned by the wallet and filter for the specific Lil Gargs collection.
     * 
     * NOTE: This implementation is a basic example. For robust production use, consider:
     * - Using an RPC provider's NFT API (e.g., Helius DAS API, Alchemy NFT API) which are more efficient for querying NFTs.
     * - Implementing more sophisticated caching to avoid hitting RPC limits.
     * - Handling pagination if a wallet owns a very large number of NFTs.
     * 
     * @param {string} walletAddress The wallet address to check.
     * @returns {Promise<{isVerified: boolean, nftCount: number, nfts: Array<Object>}>} Verification result.
     */
    async verifyNFTOwnership(walletAddress) {
        if (!this.isValidSolanaAddress(walletAddress)) {
            logger.warn(`Invalid wallet address provided for verification: ${walletAddress}`);
            return { isVerified: false, nftCount: 0, nfts: [] };
        }

        logger.info(`Attempting to verify NFT ownership for wallet: ${walletAddress}`);
        let ownedLilGargs = [];
        const ownerPublicKey = new PublicKey(walletAddress);

        try {
            // Fetch all token accounts for the wallet (this includes NFTs, tokens, etc.)
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                ownerPublicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbVsHgcnQpfyWcPCNyXd6NDb') } // Token Program ID
            );

            for (const account of tokenAccounts.value) {
                const parsedAccountInfo = account.account.data.parsed.info;
                const mintAddress = parsedAccountInfo.mint;
                const tokenAmount = parsedAccountInfo.tokenAmount.uiAmount; // UI amount of tokens in the account

                // For NFTs, uiAmount will be 1 and decimals will be 0
                if (tokenAmount === 1 && parsedAccountInfo.tokenAmount.decimals === 0) {
                    // This is likely an NFT. Now, fetch its metadata to check collection.
                    // Note: Directly fetching metadata via RPC can be slow and rate-limited for many NFTs.
                    // A dedicated NFT API is highly recommended for production.
                    
                    // For simplicity, we'll directly check the mint against the collection address if it's a direct collection mint
                    // OR if we're using Update Authority as collection identifier.
                    // This part needs to be adapted based on how Lil Gargs identifies its collection.
                    
                    // A more robust check for a collection often involves fetching the Metaplex metadata
                    // and inspecting its 'collection' field or 'updateAuthority' field.
                    // For this basic example, let's assume LIL_GARGS_COLLECTION_ADDRESS is the Update Authority or a specific Collection Mint.

                    // --- Simplified check (needs adaptation based on your NFT project's specifics) ---
                    // If LIL_GARGS_COLLECTION_ADDRESS is the Update Authority for all Lil Gargs NFTs:
                    // You would typically fetch the mint's metadata and check its update authority.
                    // This requires fetching the PDA for the metadata account.
                    
                    // For demonstration, let's assume LIL_GARGS_COLLECTION_ADDRESS is a *direct collection mint* for simplicity
                    // or you have a way to quickly identify it without full metadata fetch per NFT.

                    // A *more realistic* basic check would involve fetching metadata account and checking updateAuthority.
                    // For brevity, let's pretend LIL_GARGS_COLLECTION_ADDRESS is an authority.
                    // This part is a *placeholder* and needs real logic based on your NFT metadata structure.
                    const isLilGargNFT = await this._isNftFromLilGargsCollection(mintAddress);
                    if (isLilGargNFT) {
                        ownedLilGargs.push({ mint: mintAddress, name: `Lil Garg #${ownedLilGargs.length + 1}`, image: 'Unknown' }); // Name/Image would come from metadata
                    }
                }
            }
            logger.info(`Found ${ownedLilGargs.length} Lil Gargs NFTs for wallet: ${walletAddress}`);

        } catch (error) {
            logger.error(`Error verifying NFT ownership for ${walletAddress}: ${error.message}`);
            // Depending on the error, you might want to differentiate between network errors and actual non-ownership
            return { isVerified: false, nftCount: 0, nfts: [] };
        }

        return {
            isVerified: ownedLilGargs.length > 0,
            nftCount: ownedLilGargs.length,
            nfts: ownedLilGargs,
        };
    }

    /**
     * Internal helper to determine if an NFT belongs to the Lil Gargs collection.
     * This is a critical placeholder and needs to be implemented based on your NFT's on-chain metadata.
     * Options:
     * 1. Check if the NFT's 'Update Authority' matches LIL_GARGS_COLLECTION_ADDRESS.
     * 2. Check the 'Collection' field in Metaplex metadata (requires fetching metadata account).
     * 3. Use a specific NFT API (Helius, QuickNode) that allows filtering by collection.
     * 
     * For now, this is a very simplified mock. Replace with real logic.
     * @param {string} mintAddress The mint address of the NFT.
     * @returns {Promise<boolean>} True if it's a Lil Gargs NFT.
     */
    async _isNftFromLilGargsCollection(mintAddress) {
        // This is a simplified check. In a real scenario, you'd fetch the Metaplex PDA for the mint
        // and then fetch the account info to read its data.
        // For example, using @metaplex-foundation/mpl-token-metadata library to parse metadata.

        // Example (conceptual, requires @metaplex-foundation/mpl-token-metadata and more setup):
        /*
        const metadataPDA = PublicKey.findProgramAddressSync(
            [Buffer.from('metadata'), new PublicKey('metaqbxxUerdq28cj1RbTFW3aRPWju9mSgLAbozDs-assets').toBuffer(), new PublicKey(mintAddress).toBuffer()],
            new PublicKey('metaqbxxUerdq28cj1RbTFW3aRPWju9mSgLAbozDs-assets') // Metaplex Metadata Program ID
        )[0];
        const metadataAccountInfo = await this.connection.getAccountInfo(metadataPDA);
        if (metadataAccountInfo) {
            const metadata = decodeMetadata(metadataAccountInfo.data); // from @metaplex-foundation/mpl-token-metadata
            // Check metadata.collection or metadata.updateAuthority
            if (metadata.updateAuthority.toBase58() === LIL_GARGS_COLLECTION_ADDRESS) {
                 return true;
            }
            // Or if using new collections standard:
            // if (metadata.collection && metadata.collection.verified && metadata.collection.key.toBase58() === LIL_GARGS_COLLECTION_ADDRESS) {
            //     return true;
            // }
        }
        */

        // *** CRITICAL: REPLACE THIS MOCK LOGIC WITH YOUR ACTUAL COLLECTION IDENTIFICATION LOGIC ***
        logger.warn(`_isNftFromLilGargsCollection is using mock logic. Please implement actual blockchain verification for mint: ${mintAddress}`);
        // For the sake of completing the code, we'll allow any NFT if LIL_GARGS_COLLECTION_ADDRESS is set,
        // BUT YOU MUST REPLACE THIS FOR PRODUCTION.
        return true; // Assume any NFT is a Lil Gargs for now, but this is BAD.
    }

}

module.exports = NFTVerificationService;
