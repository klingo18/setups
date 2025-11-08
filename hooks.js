// Shared React Hooks for Wallet and Chain Management
import { NETWORK } from './constants.js';

const { useState, useEffect } = React;

// Shared wallet connection hook
export function useWallet() {
  const [walletStatus, setWalletStatus] = useState('Not Connected');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletClient, setWalletClient] = useState(null);

  // Define checkExistingConnection before useEffect
  const checkExistingConnection = async () => {
    if (!window.ethereum) {
      setWalletStatus('Wallet Not Detected');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setWalletStatus('Connected');
      }
    } catch (error) {
      console.error('Error checking wallet:', error);
    }
  };

  useEffect(() => {
    // Check if user manually disconnected
    let wasDisconnected = false;
    try {
      wasDisconnected = sessionStorage.getItem('wallet_disconnected') === 'true';
    } catch (e) {
      // sessionStorage not available, continue normally
    }
    
    if (!wasDisconnected) {
      checkExistingConnection();
    } else {
      // Clear the flag after checking
      try {
        sessionStorage.removeItem('wallet_disconnected');
      } catch (e) {
        // Ignore storage errors
      }
    }

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setWalletStatus('Not Connected');
        setWalletAddress('');
        setWalletClient(null);
      } else {
        setWalletAddress(accounts[0]);
        setWalletStatus('Connected');
        // Clear disconnect flag if user switches accounts
        try {
          sessionStorage.removeItem('wallet_disconnected');
        } catch (e) {
          // Ignore storage errors
        }
      }
    };

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disconnectWallet = () => {
    // Set flag to prevent auto-reconnect
    try {
      sessionStorage.setItem('wallet_disconnected', 'true');
    } catch (e) {
      // Ignore storage errors
    }
    
    // Reset state
    setWalletStatus('Not Connected');
    setWalletAddress('');
    setWalletClient(null);
    
    return true;
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setWalletStatus('Wallet Not Detected');
      return false;
    }

    try {
      // Clear disconnect flag when user manually connects
      try {
        sessionStorage.removeItem('wallet_disconnected');
      } catch (e) {
        // Ignore
      }

      // Force account picker when user clicks "Connect Wallet" button
      try {
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (permError) {
        // If user rejects or method not supported, fall back to normal flow
        if (permError.code === 4001) {
          // User rejected
          throw permError;
        }
        // Otherwise continue with regular request
        console.log('wallet_requestPermissions not supported, using eth_requestAccounts');
      }

      const [account] = await window.ethereum.request({
        method: "eth_requestAccounts"
      });

      setWalletAddress(account);
      setWalletStatus('Connected');
      return true;
    } catch (error) {
      setWalletStatus('Connection Failed');
      console.error('Connection error:', error);
      return false;
    }
  };

  return {
    walletStatus,
    walletAddress,
    walletClient,
    setWalletClient,
    connectWallet,
    disconnectWallet,
    isConnected: walletStatus === 'Connected'
  };
}

// Shared chain validation hook
export function useChain() {
  const [chainId, setChainId] = useState(null);

  useEffect(() => {
    checkChain();

    const handleChainChanged = (newChainId) => {
      setChainId(newChainId);
    };

    if (window.ethereum) {
      window.ethereum.on('chainChanged', handleChainChanged);
      return () => {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const checkChain = async () => {
    if (!window.ethereum) return;
    
    try {
      const chain = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(chain);
    } catch (error) {
      console.error('Failed to get chain:', error);
    }
  };

  const switchToArbitrum = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK.ARBITRUM_CHAIN_ID }]
      });
      return true;
    } catch (error) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: NETWORK.ARBITRUM_CHAIN_ID,
              chainName: NETWORK.CHAIN_NAME,
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [NETWORK.RPC_URL],
              blockExplorerUrls: [NETWORK.EXPLORER_URL]
            }]
          });
          return true;
        } catch (addError) {
          console.error('Failed to add Arbitrum network:', addError);
          return false;
        }
      }
      return false;
    }
  };

  return {
    chainId,
    isArbitrum: chainId === NETWORK.ARBITRUM_CHAIN_ID,
    switchToArbitrum
  };
}

// USDC balance check hook
export function useUSDCBalance(walletAddress, chainId) {
  const [balance, setBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);

  const checkBalance = async () => {
    if (!window.ethereum || !walletAddress || chainId !== NETWORK.ARBITRUM_CHAIN_ID) {
      setBalance('0');
      return 0;
    }
    
    setIsLoading(true);
    try {
      const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
      const balanceHex = await window.ethereum.request({
        method: 'eth_call',
        params: [{
          to: USDC_CONTRACT,
          data: '0x70a08231000000000000000000000000' + walletAddress.slice(2)
        }, 'latest']
      });
      
      const balanceNum = parseInt(balanceHex, 16) / 1e6;
      setBalance(balanceNum.toFixed(2));
      return balanceNum;
    } catch (error) {
      console.error('Error checking USDC balance:', error);
      setBalance('0');
      return 0;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress && chainId === NETWORK.ARBITRUM_CHAIN_ID) {
      checkBalance();
    }
  }, [walletAddress, chainId]);

  return { balance, isLoading, checkBalance };
}

// Hyperliquid balance check hook
export function useHyperliquidBalance(walletAddress) {
  const [balance, setBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);

  const checkBalance = async () => {
    if (!walletAddress) {
      setBalance('0');
      return 0;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'clearinghouseState',
          user: walletAddress
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      let balanceValue = '0';
      
      if (data.marginSummary?.accountValue) {
        balanceValue = data.marginSummary.accountValue;
      } else if (data.crossMarginSummary?.accountValue) {
        balanceValue = data.crossMarginSummary.accountValue;
      }

      const formatted = parseFloat(balanceValue).toFixed(2);
      setBalance(formatted);
      return parseFloat(formatted);
    } catch (error) {
      console.error('Error checking Hyperliquid balance:', error);
      setBalance('0');
      return 0;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (walletAddress) {
      checkBalance();
    }
  }, [walletAddress]);

  return { balance, isLoading, checkBalance };
}
