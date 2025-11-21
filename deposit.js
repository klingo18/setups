import { useWallet, useChain, useUSDCBalance, useHyperliquidBalance } from './hooks.js';
import { CONTRACTS, NETWORK, HYPERLIQUID, MESSAGES, BRANDING } from './constants.js';

const { useState, useEffect } = React;

function HyperliquidDeposit() {
  // Use shared hooks
  const { walletStatus, walletAddress, connectWallet, isConnected } = useWallet();
  const { chainId, isArbitrum, switchToArbitrum } = useChain();
  const { balance: usdcBalance, checkBalance: checkUSDCBalance } = useUSDCBalance(walletAddress, chainId);
  const { balance: hlUsdcBalance, isLoading: checkingHlBalance, checkBalance: checkHLBalance } = useHyperliquidBalance(walletAddress);
  
  // Deposit functionality state
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStage, setDepositStage] = useState('ready');
  const [depositAmount, setDepositAmount] = useState('');
  const [maxBalance, setMaxBalance] = useState('0');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [responseMessage, setResponseMessage] = useState('');
  const [responseType, setResponseType] = useState('');
  const [depositError, setDepositError] = useState(''); // FIX: Added missing state
  const [txHash, setTxHash] = useState('');

  // Auto-refresh balances when wallet connects
  useEffect(() => {
    if (walletAddress && isArbitrum) {
      checkUSDCBalance();
      checkHLBalance();
    }
  }, [walletAddress, isArbitrum]);

  // Deposit to Hyperliquid functionality
  const initiateDeposit = async () => {
    if (!window.ethereum) {
      setResponseMessage(MESSAGES.WALLET_NOT_DETECTED);
      setResponseType('error');
      return;
    }

    if (!isConnected) {
      setResponseMessage(MESSAGES.CONNECT_FIRST);
      setResponseType('error');
      return;
    }

    if (!isArbitrum) {
      setResponseMessage(MESSAGES.SWITCH_TO_ARBITRUM);
      setResponseType('error');
      return;
    }

    // Check HL balance first - before opening modal
    const currentHlBalance = parseFloat(hlUsdcBalance);
    if (currentHlBalance >= HYPERLIQUID.MIN_DEPOSIT_USDC) {
      setResponseMessage(`You already have ${currentHlBalance.toFixed(2)} USDC on Hyperliquid. No deposit needed!`);
      setResponseType('success');
      return;
    }

    // Only open modal if deposit is actually needed
    setShowDepositModal(true);
    setDepositStage('checking');
    setDepositError('');

    try {
      // Get current USDC balance
      const arbBalance = parseFloat(usdcBalance);
      
      if (arbBalance < HYPERLIQUID.MIN_DEPOSIT_USDC) {
        setDepositError(`Minimum deposit amount is ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC. You have ${arbBalance.toFixed(2)} USDC on Arbitrum. ${MESSAGES.BELOW_MIN_WARNING}`);
        setDepositStage('error');
        return;
      }

      setMaxBalance(arbBalance.toFixed(2));
      setDepositAmount(arbBalance.toFixed(2)); // Preset to max, but user can change
      setDepositStage('confirm');
      
    } catch (error) {
      console.error('Error checking balance:', error);
      setDepositError('Failed to check your USDC balance. Please try again.');
      setDepositStage('error');
    }
  };

  const confirmDeposit = async () => {
    // Validate deposit amount
    const amount = parseFloat(depositAmount);
    const maxBal = parseFloat(maxBalance);
    
    if (!amount || amount <= 0) {
      setDepositError('Please enter a valid deposit amount');
      setDepositStage('error');
      return;
    }
    
    if (amount < HYPERLIQUID.MIN_DEPOSIT_USDC) {
      setDepositError(`Minimum deposit is ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC. ${MESSAGES.BELOW_MIN_WARNING}`);
      setDepositStage('error');
      return;
    }
    
    if (amount > maxBal) {
      setDepositError(`Amount exceeds available balance of ${maxBal} USDC`);
      setDepositStage('error');
      return;
    }

    setDepositStage('processing');
    setIsDepositing(true);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const account = accounts[0];
      
      const USDC_CONTRACT = CONTRACTS.USDC_ARBITRUM;
      const HYPERLIQUID_BRIDGE = CONTRACTS.HYPERLIQUID_BRIDGE;
      
      // Convert user amount to USDC wei (6 decimals)
      const depositAmountWei = Math.floor(amount * 1e6);
      
      // Check current allowance
      const allowanceHex = await window.ethereum.request({
        method: 'eth_call',
        params: [{
          to: USDC_CONTRACT,
          data: '0xdd62ed3e' + 
                account.slice(2).padStart(64, '0') + 
                HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0')
        }, 'latest']
      });
      
      const currentAllowance = parseInt(allowanceHex, 16);
      
      // Only approve if allowance is insufficient
      if (currentAllowance < depositAmountWei) {
        const approveGasEstimate = await window.ethereum.request({
          method: 'eth_estimateGas',
          params: [{
            from: account,
            to: USDC_CONTRACT,
            data: '0x095ea7b3' + 
                  HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0') + 
                  depositAmountWei.toString(16).padStart(64, '0')
          }]
        });
        
        const approveTx = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: account,
            to: USDC_CONTRACT,
            data: '0x095ea7b3' + 
                  HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0') + 
                  depositAmountWei.toString(16).padStart(64, '0'),
            gas: approveGasEstimate
          }]
        });
        
        await waitForTransaction(approveTx);
      }
      
      // Use transferFrom instead of deposit function
      // This transfers USDC directly to the bridge which should trigger the deposit
      const depositTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: USDC_CONTRACT,
          data: '0xa9059cbb' + // transfer(address,uint256) function selector
                HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0') + 
                depositAmountWei.toString(16).padStart(64, '0')
        }]
      });
      
      setTxHash(depositTx);
      setDepositStage('verifying');
      
      // Wait for transaction confirmation
      await waitForTransaction(depositTx);
      
      setDepositStage('success');
      setResponseMessage(`${MESSAGES.DEPOSIT_SUCCESS} ${amount.toFixed(2)} USDC`);
      setResponseType('success');
      
    } catch (error) {
      console.error('Error making deposit:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      let errorMessage = 'Failed to process deposit. Please try again.';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.code) {
        errorMessage = `Transaction failed with code: ${error.code}`;
      } else if (typeof error === 'object') {
        errorMessage = `Transaction error: ${JSON.stringify(error)}`;
      }
      
      setDepositError(errorMessage);
      setDepositStage('error');
    } finally {
      setIsDepositing(false);
    }
  };

  const waitForTransaction = async (txHash) => {
    return new Promise((resolve, reject) => {
      const checkTx = async () => {
        try {
          const receipt = await window.ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          });
          
          if (receipt) {
            if (receipt.status === '0x1') {
              resolve(receipt);
            } else {
              reject(new Error('Transaction failed'));
            }
          } else {
            setTimeout(checkTx, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };
      checkTx();
    });
  };

  const closeDepositModal = () => {
    setShowDepositModal(false);
    setDepositStage('ready');
    setDepositError('');
    setTxHash('');
    setDepositAmount('');
    setMaxBalance('0');
  };

  return React.createElement("div", { className: "container" },
    React.createElement("div", { className: "card" },
      React.createElement("h1", { className: "title" }, BRANDING.NAME),
      React.createElement("p", { className: "subtitle" }, "Deposit to Hyperliquid"),
      
      !isArbitrum && isConnected &&
        React.createElement("div", { className: "message error" },
          React.createElement("p", null, MESSAGES.SWITCH_TO_ARBITRUM),
          React.createElement("button", {
            onClick: switchToArbitrum,
            className: "switch-network"
          }, "Switch Network")
        ),

      React.createElement("div", { className: "status" },
        React.createElement("span", {
          className: `status-dot ${isConnected ? 'connected' : 'disconnected'}`
        }),
        walletStatus
      ),

      walletAddress &&
        React.createElement("div", { style: { marginBottom: '15px', fontSize: '14px' } },
          React.createElement("strong", null, "Connected:"),
          walletAddress.substring(0, 6),
          "...",
          walletAddress.substring(38),
          React.createElement("br", null),
          React.createElement("strong", null, "Network:"),
          isArbitrum ? 'Arbitrum' : 'Wrong Network',
          React.createElement("br", null),
          React.createElement("strong", null, "Arbitrum USDC:"),
          usdcBalance,
          " USDC",
          React.createElement("br", null),
          React.createElement("strong", null, "Hyperliquid USDC:"),
          checkingHlBalance ? 'Checking...' : `${hlUsdcBalance} USDC`,
          parseFloat(hlUsdcBalance) >= HYPERLIQUID.MIN_DEPOSIT_USDC && React.createElement("span", {
            style: { color: '#10B981', marginLeft: '10px' }
          }, "Sufficient")
        ),

      !isConnected &&
        React.createElement("button", {
          onClick: connectWallet,
          className: "button button-primary"
        }, "Connect Wallet"),

      React.createElement("button", {
        onClick: initiateDeposit,
        disabled: !isConnected || !isArbitrum,
        className: `button ${isConnected && isArbitrum ? 'button-primary' : 'button-disabled'}`
      }, parseFloat(hlUsdcBalance) >= HYPERLIQUID.MIN_DEPOSIT_USDC ? "USDC Already on Hyperliquid" : "Deposit USDC to Hyperliquid"),

      responseMessage &&
        React.createElement("div", {
          className: `message ${responseType}`
        }, responseMessage),

      // Deposit Modal
      showDepositModal && React.createElement("div", {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }
      },
        React.createElement("div", {
          style: {
            backgroundColor: '#1F2937',
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid #374151'
          }
        },
          React.createElement("h3", {
            style: { margin: '0 0 1rem 0', color: 'white' }
          }, 'Deposit to Hyperliquid'),
          
          depositStage === 'checking' && React.createElement("p", {
            style: { color: '#9CA3AF' }
          }, 'Checking your USDC balance...'),
          
          depositStage === 'confirm' && React.createElement("div", null,
            React.createElement("div", {
              style: { marginBottom: '1rem' }
            },
              React.createElement("label", {
                style: { 
                  display: 'block',
                  color: '#9CA3AF',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }
              }, 'Deposit Amount (USDC)'),
              React.createElement("div", {
                style: { display: 'flex', gap: '0.5rem', alignItems: 'center' }
              },
                React.createElement("input", {
                  type: 'number',
                  value: depositAmount,
                  onChange: (e) => setDepositAmount(e.target.value),
                  min: HYPERLIQUID.MIN_DEPOSIT_USDC,
                  max: maxBalance,
                  step: '0.01',
                  style: {
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(87, 90, 94, 0.4)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    color: 'white',
                    fontSize: '1rem',
                    outline: 'none'
                  },
                  placeholder: `Min: ${HYPERLIQUID.MIN_DEPOSIT_USDC}`
                }),
                React.createElement("button", {
                  onClick: () => setDepositAmount(maxBalance),
                  className: 'button',
                  style: {
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#9CA3AF',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                  }
                }, 'Max')
              ),
              React.createElement("p", {
                style: { 
                  color: '#6B7280',
                  fontSize: '0.75rem',
                  marginTop: '0.5rem'
                }
              }, `Available: ${maxBalance} USDC`)
            ),
            parseFloat(depositAmount) > parseFloat(maxBalance) && React.createElement("div", {
              style: {
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                marginBottom: '1rem'
              }
            }, 'Amount exceeds available balance'),
            parseFloat(depositAmount) < HYPERLIQUID.MIN_DEPOSIT_USDC && depositAmount && React.createElement("div", {
              style: {
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid #F59E0B',
                color: '#FCD34D',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                marginBottom: '1rem'
              }
            }, `Minimum deposit is ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC`),
            React.createElement("div", {
              style: {
                backgroundColor: '#374151',
                padding: '1rem',
                borderRadius: '0.25rem',
                marginBottom: '1rem'
              }
            },
              React.createElement("p", {
                style: { margin: 0, fontSize: '0.875rem', color: '#FCA5A5' }
              }, 'Important: This action cannot be undone. Verify the amount before confirming.')
            ),
            React.createElement("div", {
              style: { display: 'flex', gap: '0.5rem' }
            },
              React.createElement("button", {
                onClick: confirmDeposit,
                className: "button button-primary",
                style: { flex: 1 },
                disabled: !depositAmount || parseFloat(depositAmount) < HYPERLIQUID.MIN_DEPOSIT_USDC || parseFloat(depositAmount) > parseFloat(maxBalance)
              }, 'Confirm Deposit'),
              React.createElement("button", {
                onClick: closeDepositModal,
                className: "button",
                style: { flex: 1, background: '#374151' }
              }, 'Cancel')
            )
          ),
          
          depositStage === 'processing' && React.createElement("p", {
            style: { color: '#9CA3AF' }
          }, `Processing deposit of ${depositAmount} USDC...`),
          
          depositStage === 'verifying' && React.createElement("p", {
            style: { color: '#9CA3AF' }
          }, 'Verifying transaction...'),
          
          depositStage === 'success' && React.createElement("div", null,
            React.createElement("p", {
              style: { color: '#34D399', marginBottom: '1rem' }
            }, `Deposit successful! ${depositAmount} USDC sent to Hyperliquid.`),
            txHash && React.createElement("a", {
              href: `https://arbiscan.io/tx/${txHash}`,
              target: '_blank',
              rel: 'noopener noreferrer',
              style: { color: '#3B82F6', fontSize: '0.875rem' }
            }, 'View on Arbiscan'),
            React.createElement("button", {
              onClick: closeDepositModal,
              className: "button button-primary",
              style: { marginTop: '1rem', width: '100%' }
            }, 'Close')
          ),
          
          depositStage === 'error' && React.createElement("div", null,
            React.createElement("p", {
              style: { color: '#FCA5A5', marginBottom: '1rem' }
            }, depositError),
            React.createElement("button", {
              onClick: closeDepositModal,
              className: "button",
              style: { background: '#374151', width: '100%' }
            }, 'Close')
          )
        )
      )
    )
  );
}

const depositRoot = ReactDOM.createRoot(document.getElementById('deposit-root'));
depositRoot.render(React.createElement(HyperliquidDeposit));
