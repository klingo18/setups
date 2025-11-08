// EV+ Configuration Constants

export const CONTRACTS = {
  USDC_ARBITRUM: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  HYPERLIQUID_BRIDGE: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7',
  BUILDER_ADDRESS: '0xC1A2f762F67aF72FD05e79afa23F8358A4d7dbaF'
};

export const NETWORK = {
  ARBITRUM_CHAIN_ID: '0xa4b1',
  ARBITRUM_CHAIN_ID_DECIMAL: 42161,
  CHAIN_NAME: 'Arbitrum One',
  RPC_URL: 'https://arb1.arbitrum.io/rpc',
  EXPLORER_URL: 'https://arbiscan.io'
};

export const HYPERLIQUID = {
  API_MAINNET: 'https://api.hyperliquid.xyz',
  API_TESTNET: 'https://api.hyperliquid-testnet.xyz',
  MIN_DEPOSIT_USDC: 5.0,
  BUILDER_FEE_MAX: '0.1%'
};

export const MESSAGES = {
  WALLET_NOT_DETECTED: 'Wallet not detected. Please install a web3 wallet.',
  CONNECT_FIRST: 'Please connect your wallet first.',
  SWITCH_TO_ARBITRUM: 'Please switch to Arbitrum network.',
  BUILDER_FEE_SUCCESS: 'Builder Fee Approved Successfully! Welcome to EV+',
  DEPOSIT_SUCCESS: 'Deposit successful! Your USDC is now on Hyperliquid.',
  AGENT_CREATED: 'Agent wallet created and approved successfully!',
  INSUFFICIENT_BALANCE: 'Insufficient USDC balance. Minimum deposit is 5.0 USDC.',
  BELOW_MIN_WARNING: 'Amounts below 5.0 USDC sent to Hyperliquid are permanently lost!'
};

export const STYLES = {
  COLORS: {
    PRIMARY: '#10B981', // Green
    SECONDARY: '#059669', // Dark green
    ACCENT: '#34D399', // Light green
    BG_DARK: '#111827',
    BG_CARD: '#1F2937',
    BG_HOVER: '#374151',
    TEXT_PRIMARY: '#FFFFFF',
    TEXT_SECONDARY: '#9CA3AF',
    TEXT_MUTED: '#6B7280',
    ERROR: '#EF4444',
    ERROR_BG: '#7F1D1D',
    ERROR_TEXT: '#FCA5A5',
    SUCCESS: '#22C55E',
    SUCCESS_BG: '#064E3B',
    SUCCESS_TEXT: '#34D399',
    WARNING: '#F59E0B',
    WARNING_BG: '#78350F',
    WARNING_TEXT: '#FCD34D'
  }
};

export const BRANDING = {
  NAME: 'EV+',
  TAGLINE: 'Hyperliquid Setup',
  DESCRIPTION: 'Professional onboarding for Hyperliquid trading'
};
