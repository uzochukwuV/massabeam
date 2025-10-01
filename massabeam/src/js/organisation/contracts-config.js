export const DEPLOYED_CONTRACTS = {
  // Token Addresses
  TOKENS: {
    USDT: "AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk",
    USDC: "AS1DtUpyTE2q7rc7r24xt3ZGy3MEHKLFBGQtpMAkPKmAadfLojem",
    BEAM: "AS12ohemfEnZcSedvahBwgKdVfjTDJER5cvgXSszcF4kBtT6EkTx9",
  },

  // Protocol Contracts
  AMM: "AS168XvaRiZPuV65k3mut4hbcLz8fUNvP2ZrZQZFPyoYUHBbtJg3",
  DCA: "AS19FLoP64D4ZMB1QagnprYHFwbojCjcympYQ5ALoP4o2soJcsjt",
  ENGINE: "AS1jymVw7ZKXSZwyLbTxhCorVqWDMZ3dBxQZVvgavFuVFT7tgmm1",

  // Deployment Info
  DEPLOYER: "AU12G4TFGs7EFxAd98sDyW2qni8LMwy6QPoNuDao2DmF3NdCun7ma",
  DEPLOYED_AT: "2025-10-01T10:19:34.814Z",
};

// Token Metadata
export const TOKEN_METADATA = {
  USDT: {
    name: "BeamUSDT",
    symbol: "USDT",
    decimals: 8,
    address: "AS1nDAemyLSLUuNZ747Dt3NgzEC9WGCkmjRvY9hZwW2928Fxb4Fk"
  },
  USDC: {
    name: "BeamUSDC",
    symbol: "USDC",
    decimals: 8,
    address: "AS1DtUpyTE2q7rc7r24xt3ZGy3MEHKLFBGQtpMAkPKmAadfLojem"
  },
  BEAM: {
    name: "BeamCoin",
    symbol: "BEAM",
    decimals: 8,
    address: "AS12ohemfEnZcSedvahBwgKdVfjTDJER5cvgXSszcF4kBtT6EkTx9"
  },
};

// Get all tokens as array
export const TOKENS_LIST = Object.values(TOKEN_METADATA);
