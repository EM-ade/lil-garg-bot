const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { PublicKey } = require('@solana/web3.js');
const SolanaConnectionService = require('./solanaConnectionService');
const logger = require('../utils/logger');
const config = require('../config/environment');

class VerificationServer {
    constructor() {
        this.app = express();
        this.port = process.env.VERIFICATION_PORT || 3001;
        this.solanaService = new SolanaConnectionService();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
    }

    setupRoutes() {
        // Generate a verification message
        this.app.post('/api/verification/message', async (req, res) => {
            try {
                const { discordId, walletAddress } = req.body;

                if (!discordId || !walletAddress) {
                    return res.status(400).json({ error: 'Missing required parameters' });
                }

                // Validate wallet address
                if (!this.solanaService.isValidSolanaAddress(walletAddress)) {
                    return res.status(400).json({ error: 'Invalid Solana wallet address' });
                }

                // Generate verification message
                const message = this.solanaService.generateVerificationMessage(discordId, walletAddress);

                res.json({
                    success: true,
                    message: message
                });
            } catch (error) {
                logger.error('Error generating verification message:', error);
                res.status(500).json({ error: 'Failed to generate verification message' });
            }
        });

        // Verify a signed message
        this.app.post('/api/verification/verify', async (req, res) => {
            try {
                const { discordId, walletAddress, message, signature } = req.body;

                if (!discordId || !walletAddress || !message || !signature) {
                    return res.status(400).json({ error: 'Missing required parameters' });
                }

                // Validate wallet address
                if (!this.solanaService.isValidSolanaAddress(walletAddress)) {
                    return res.status(400).json({ error: 'Invalid Solana wallet address' });
                }

                // Verify the signed message
                const isValid = await this.solanaService.verifySignedMessage(message, signature, walletAddress);

                if (!isValid) {
                    return res.status(400).json({ error: 'Invalid signature' });
                }

                // Get NFTs owned by the wallet
                const nfts = await this.solanaService.getNFTsByOwner(walletAddress);

                // Filter for Lil Gargs NFTs
                const lilGargsNFTs = nfts.filter(nft =>
                    this.solanaService.isLilGargsNFT(nft, config.nft.contractAddress)
                );

                res.json({
                    success: true,
                    verified: true,
                    walletAddress: walletAddress,
                    nftCount: lilGargsNFTs.length,
                    nfts: lilGargsNFTs.map(nft => ({
                        mint: nft.id,
                        name: nft.content?.metadata?.name || "Unknown Lil Garg",
                        image: nft.content?.links?.image || nft.content?.files?.[0]?.uri
                    }))
                });
            } catch (error) {
                logger.error('Error verifying signed message:', error);
                res.status(500).json({ error: 'Failed to verify signed message' });
            }
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok' });
        });
    }

    start() {
        this.server = this.app.listen(this.port, () => {
            logger.info(`Verification server running on port ${this.port}`);
            console.log(`[${new Date().toISOString()}] Verification server running on port ${this.port}`);
        });

        this.server.on('error', (error) => {
            logger.error('Verification server error:', error);
        });
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                logger.info('Verification server stopped');
            });
        }
    }
}

module.exports = VerificationServer;