module.exports = {
  nftCollections: [
    {
      name: 'Lil Gargs',
      contractAddress: '0xabcdef1234567890abcdef1234567890abcdef', // Placeholder: Replace with actual contract address
      rules: [
        { minHolding: 1, roleName: 'Holder' },
        { minHolding: 5, roleName: 'Whale' },
      ],
    },
    // Add more NFT collections here
    // {
    //   name: 'Another NFT Collection',
    //   contractAddress: '0x0987654321fedcba0987654321fedcba0987',
    //   rules: [
    //     { minHolding: 1, roleName: 'Another Collection Holder' },
    //   ],
    // },
  ],
};
