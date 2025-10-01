// Global application state
export const AppState = {
  currentSection: "dashboard",
  isLoading: false,
  user: {
    address: null,
    connected: false,
  },
  portfolio: {
    totalValue: 0,
    assets: [],
    positions: [],
    transactions: [],
  },
  pools: [],
  orders: [],
  dcaStrategies: [],
  yieldPositions: [],
  arbitrageOpportunities: [],
};
