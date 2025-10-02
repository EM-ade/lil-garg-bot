const express = require('express');
const router = express.Router();

// Endpoint to verify NFT ownership
router.post('/verify', async (req, res) => {
  const { walletAddress } = req.body;

  // Validate input
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address is required' });
  }

  // Get environment variables
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const nftCollectionAddress = process.env.NFT_COLLECTION_ADDRESS;

  if (!heliusApiKey || !nftCollectionAddress) {
    console.error('Missing environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Get all NFTs for the wallet using Helius API
    const response = await fetch(
      `https://api.helius.dev/v0/addresses/${walletAddress}/nfts?api-key=${heliusApiKey}`
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Helius API error:', errorData);
      return res.status(500).json({ isVerified: false });
    }

    const nfts = await response.json();

    // Check if any NFT belongs to the specified collection
    const hasCollectionNFT = nfts.some(nft =>
      nft.grouping?.some(group => group.group_value === nftCollectionAddress)
    );

    // Count the number of NFTs from the collection
    const nftCount = nfts.filter(nft =>
      nft.grouping?.some(group => group.group_value === nftCollectionAddress)
    ).length;

    return res.status(200).json({ isVerified: hasCollectionNFT, nftCount });

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ isVerified: false });
  }
});

module.exports = router;