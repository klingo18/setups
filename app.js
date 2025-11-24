// EV+ Modern Unified App
import { useWallet, useChain, useUSDCBalance, useHyperliquidBalance } from './hooks.js';
import { CONTRACTS, NETWORK, HYPERLIQUID, MESSAGES, BRANDING } from './constants.js';
import * as hl from "https://esm.sh/@nktkas/hyperliquid";
import { createWalletClient, custom } from "https://esm.sh/viem";

const { useState, useEffect } = React;

function EVPlusApp() {
  const { walletStatus, walletAddress, walletClient, setWalletClient, connectWallet, disconnectWallet, isConnected } = useWallet();
  const { chainId, isArbitrum, switchToArbitrum } = useChain();
  const { balance: usdcBalance, checkBalance: checkUSDCBalance } = useUSDCBalance(walletAddress, chainId);
  const { balance: hlUsdcBalance, checkBalance: checkHLBalance } = useHyperliquidBalance(walletAddress);

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  // Set up wallet client
  useEffect(() => {
    if (walletAddress && window.ethereum && !walletClient) {
      const client = createWalletClient({
        account: walletAddress,
        transport: custom(window.ethereum)
      });
      setWalletClient(client);
    }
  }, [walletAddress]);

  // Auto-advance to deposit step when connected (no auto-skip)
  useEffect(() => {
    if (isConnected && isArbitrum && currentStep === 0) {
      // Always advance to deposit step, never skip
      setCurrentStep(1);
      
      // Show informational message about balance status
      const hlBalance = parseFloat(hlUsdcBalance);
      if (hlBalance >= HYPERLIQUID.MIN_DEPOSIT_USDC) {
        setMessage(`You have ${hlBalance.toFixed(2)} USDC on Hyperliquid - you can proceed or deposit more`);
        setMessageType('info');
        setTimeout(() => setMessage(''), 4000);
      }
    }
  }, [isConnected, isArbitrum, hlUsdcBalance]);

  // Close disconnect dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showDisconnect && !e.target.closest('.wallet-badge-container')) {
        setShowDisconnect(false);
      }
    };
    
    if (showDisconnect) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDisconnect]);

  const handleDisconnect = () => {
    // Disconnect wallet using hook (sets sessionStorage flag)
    disconnectWallet();
    
    // Reset all app state
    setCurrentStep(0);
    setCompletedSteps([]);
    setMessage('');
    setMessageType('');
    setShowDisconnect(false);
    setWalletClient(null);
    setShowSecret(false);
    
    // Clear saved credentials
    sessionStorage.removeItem('agent_user_address');
    sessionStorage.removeItem('agent_secret');
    sessionStorage.removeItem('agent_address');
    
    // Show helpful message
    setTimeout(() => {
      setMessage('To switch wallets: Click "Connect Wallet" and select a different account in the popup.');
      setMessageType('info');
    }, 100);
  };

  const steps = [
    { id: 'connect', title: 'Connect Wallet', icon: 'icons/user.png' },
    { id: 'deposit', title: 'Deposit USDC', icon: 'icons/wallet.png' },
    { id: 'builder', title: 'Approve Builder', icon: 'icons/lightning.png' },
    { id: 'agent', title: 'Create Agent', icon: 'icons/bot.png' },
    { id: 'complete', title: 'Setup Complete', icon: 'icons/favicon/favicon-32x32.png' }
  ];

  const handleBuilderFee = async () => {
    if (!walletClient) {
      setMessage(MESSAGES.CONNECT_FIRST);
      setMessageType('error');
      return;
    }

    try {
      setIsProcessing(true);
      setMessage('Approving builder fee...');
      setMessageType('info');

      const transport = new hl.HttpTransport();
      const hlClient = new hl.ExchangeClient({ transport, wallet: walletClient });

      await hlClient.approveBuilderFee({
        builder: CONTRACTS.BUILDER_ADDRESS,
        maxFeeRate: HYPERLIQUID.BUILDER_FEE_MAX
      });

      setCompletedSteps([...completedSteps, 2]);
      setMessage(MESSAGES.BUILDER_FEE_SUCCESS);
      setMessageType('success');
      
      setTimeout(() => {
        setCurrentStep(3);
        setMessage('');
      }, 2000);

    } catch (error) {
      let errorMsg = error.message || 'Operation failed';
      if (errorMsg.includes('Version:')) errorMsg = errorMsg.split('Version:')[0].trim();
      if (errorMsg.includes('User rejected')) errorMsg = 'User rejected the request';
      
      setMessage(`Error: ${errorMsg}`);
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAgent = async () => {
    try {
      setIsProcessing(true);
      setMessage('Creating agent wallet...');
      setMessageType('info');

      const ethers = await import("https://esm.sh/ethers@6");
      const hlModule = await import("https://esm.sh/@nktkas/hyperliquid");

      const agentWallet = ethers.Wallet.createRandom();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const exchClient = new hlModule.ExchangeClient({
        wallet: signer,
        transport: new hlModule.HttpTransport({ isTestnet: false })
      });

      await exchClient.approveAgent({
        agentAddress: agentWallet.address,
        agentName: "EVplus Agent"
      });

      setCompletedSteps([...completedSteps, 3]);
      
      // Save agent details to show on completion screen
      sessionStorage.setItem('agent_user_address', walletAddress);
      sessionStorage.setItem('agent_secret', agentWallet.privateKey);
      sessionStorage.setItem('agent_address', agentWallet.address);
      
      // Check balance
      await checkHLBalance();
      
      setMessage(`${MESSAGES.AGENT_CREATED} Moving to completion...`);
      setMessageType('success');
      
      // Advance to completion step
      setTimeout(() => {
        setCurrentStep(4);
        setMessage('');
      }, 2000);

    } catch (error) {
      let errorMsg = error.message || 'Failed to create agent';
      if (errorMsg.includes('User rejected')) errorMsg = 'User rejected the request';
      setMessage(`Error: ${errorMsg}`);
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeposit = async () => {
    const currentHlBalance = parseFloat(hlUsdcBalance);
    
    // If they already have sufficient funds, just show message (no auto-advance)
    if (currentStep === 1 && currentHlBalance >= HYPERLIQUID.MIN_DEPOSIT_USDC && !depositAmount) {
      setMessage(`You already have ${currentHlBalance.toFixed(2)} USDC on Hyperliquid. Use Next button to continue or deposit more.`);
      setMessageType('info');
      return;
    }

    // Validate deposit amount
    const amount = parseFloat(depositAmount);
    const availableBalance = parseFloat(usdcBalance);
    
    if (!amount || amount <= 0) {
      setMessage('Please enter a valid deposit amount');
      setMessageType('error');
      return;
    }
    
    if (amount < HYPERLIQUID.MIN_DEPOSIT_USDC) {
      setMessage(`Minimum deposit is ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC`);
      setMessageType('error');
      return;
    }
    
    if (amount > availableBalance) {
      setMessage(`Amount exceeds available balance of ${availableBalance} USDC`);
      setMessageType('error');
      return;
    }

    try {
      setIsProcessing(true);
      setMessage('Processing deposit...');
      setMessageType('info');

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const account = accounts[0];

      // Convert user amount to USDC wei (6 decimals)
      const depositAmountWei = Math.floor(amount * 1e6);

      // Approve
      const approveTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: CONTRACTS.USDC_ARBITRUM,
          data: '0x095ea7b3' + 
                CONTRACTS.HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0') + 
                depositAmountWei.toString(16).padStart(64, '0')
        }]
      });

      setMessage('Waiting for approval confirmation...');
      await waitForTx(approveTx);

      // Transfer
      const depositTx = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: CONTRACTS.USDC_ARBITRUM,
          data: '0xa9059cbb' + 
                CONTRACTS.HYPERLIQUID_BRIDGE.slice(2).padStart(64, '0') + 
                depositAmountWei.toString(16).padStart(64, '0')
        }]
      });

      setMessage('Confirming deposit...');
      await waitForTx(depositTx);

      await checkHLBalance(); // Refresh balance
      
      // Show success message, let user navigate manually
      setMessage(`${MESSAGES.DEPOSIT_SUCCESS} ${amount.toFixed(2)} USDC deposited! Use Next to continue.`);
      setMessageType('success');
      setDepositAmount(''); // Reset for next time

    } catch (error) {
      setMessage(`Error: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const waitForTx = (txHash) => {
    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const receipt = await window.ethereum.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          });
          if (receipt) {
            receipt.status === '0x1' ? resolve(receipt) : reject(new Error('Transaction failed'));
          } else {
            setTimeout(check, 2000);
          }
        } catch (error) {
          reject(error);
        }
      };
      check();
    });
  };

  return React.createElement('div', { className: 'app-container' },
    // Header
    React.createElement('div', { className: 'header' },
      React.createElement('div', { className: 'logo' },
        React.createElement('img', { src: 'icons/favicon/android-chrome-192x192.png', alt: 'EV+', className: 'logo-image' })
      ),
      isConnected && React.createElement('div', { 
        className: 'wallet-badge-container'
      },
        React.createElement('div', { 
          className: 'wallet-badge',
          onClick: () => setShowDisconnect(!showDisconnect),
          style: { cursor: 'pointer' }
        },
          React.createElement('div', { className: 'wallet-indicator' }),
          React.createElement('span', null, `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`)
        ),
        showDisconnect && React.createElement('div', { 
          className: 'disconnect-dropdown'
        },
          React.createElement('button', {
            onClick: handleDisconnect,
            className: 'disconnect-btn'
          }, 'Disconnect')
        )
      )
    ),

    // Progress Stepper
    React.createElement('div', { className: 'stepper' },
      steps.map((step, idx) =>
        React.createElement('div', {
          key: step.id,
          className: `step ${currentStep === idx ? 'active' : ''} ${completedSteps.includes(idx) ? 'completed' : ''}`,
          onClick: () => !isProcessing && setCurrentStep(idx)
        },
          React.createElement('div', { className: 'step-number' },
            React.createElement('img', { src: step.icon, alt: step.title })
          ),
          React.createElement('div', { className: 'step-title' }, step.title)
        )
      )
    ),

    // Main Content Card
    React.createElement('div', { className: 'main-card' },
      // Step 0: Connect Wallet
      currentStep === 0 && React.createElement('div', { className: 'step-content' },
        React.createElement('h2', null, 'Connect Your Wallet'),
        React.createElement('p', { className: 'step-description' },
          'Connect your wallet to get started with EV+ on Hyperliquid'
        ),
        !isConnected && React.createElement('button', {
          onClick: connectWallet,
          className: 'btn-primary btn-large'
        }, 'Connect Wallet'),
        isConnected && !isArbitrum && React.createElement('div', null,
          React.createElement('div', { className: 'alert alert-warning' },
            'Please switch to Arbitrum network'
          ),
          React.createElement('button', {
            onClick: switchToArbitrum,
            className: 'btn-primary'
          }, 'Switch to Arbitrum')
        ),
        isConnected && isArbitrum && React.createElement('div', { className: 'success-check' },
          React.createElement('div', { className: 'check-icon' }, 
            React.createElement('img', { src: 'icons/favicon/android-chrome-192x192.png', alt: 'Success' })
          ),
          React.createElement('p', null, 'Wallet connected & ready!')
        )
      ),

      // Step 1: Deposit USDC (Required First)
      currentStep === 1 && React.createElement('div', { className: 'step-content' },
        React.createElement('h2', null, 'Deposit USDC'),
        React.createElement('p', { className: 'step-description' },
          'Deposit USDC to Hyperliquid before approving builder fees. Minimum 5 USDC required.'
        ),
        React.createElement('div', { className: 'balance-grid' },
          React.createElement('div', { className: 'balance-card' },
            React.createElement('div', { className: 'balance-label' }, 'Arbitrum'),
            React.createElement('div', { className: 'balance-value' }, `${usdcBalance} USDC`)
          ),
          React.createElement('div', { className: 'balance-card' },
            React.createElement('div', { className: 'balance-label' }, 'Hyperliquid'),
            React.createElement('div', { className: 'balance-value' }, `${hlUsdcBalance} USDC`)
          )
        ),
        React.createElement('div', { className: 'info-box', style: { marginTop: '1.5rem' } },
          React.createElement('div', { style: { marginBottom: '1rem' } },
            React.createElement('label', {
              style: {
                display: 'block',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                fontWeight: '600',
                marginBottom: '0.5rem'
              }
            }, 'Deposit Amount (USDC)'),
            React.createElement('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
              React.createElement('input', {
                type: 'number',
                value: depositAmount,
                onChange: (e) => setDepositAmount(e.target.value),
                min: HYPERLIQUID.MIN_DEPOSIT_USDC,
                max: usdcBalance,
                step: '0.01',
                placeholder: `Min: ${HYPERLIQUID.MIN_DEPOSIT_USDC}`,
                style: {
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(87, 90, 94, 0.4)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  color: 'var(--text-primary)',
                  fontSize: '1rem',
                  outline: 'none'
                }
              }),
              React.createElement('button', {
                onClick: () => setDepositAmount(usdcBalance),
                className: 'btn-secondary',
                type: 'button',
                style: { padding: '0.75rem 1.25rem', margin: 0 }
              }, 'Max')
            ),
            React.createElement('p', {
              style: {
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                marginTop: '0.5rem',
                marginBottom: 0
              }
            }, `Available: ${usdcBalance} USDC`)
          ),
          parseFloat(depositAmount) > parseFloat(usdcBalance) && React.createElement('div', { className: 'alert alert-error', style: { marginTop: '0.5rem' } },
            'Amount exceeds available balance'
          ),
          parseFloat(depositAmount) < HYPERLIQUID.MIN_DEPOSIT_USDC && depositAmount && React.createElement('div', { className: 'alert alert-warning', style: { marginTop: '0.5rem' } },
            `Minimum deposit is ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC`
          )
        ),
        parseFloat(hlUsdcBalance) < HYPERLIQUID.MIN_DEPOSIT_USDC && React.createElement('div', { className: 'alert alert-warning', style: { marginTop: '1rem' } },
          `You need at least ${HYPERLIQUID.MIN_DEPOSIT_USDC} USDC on Hyperliquid to continue`
        ),
        React.createElement('button', {
          onClick: handleDeposit,
          disabled: isProcessing || !depositAmount || (depositAmount && (parseFloat(depositAmount) < HYPERLIQUID.MIN_DEPOSIT_USDC || parseFloat(depositAmount) > parseFloat(usdcBalance))),
          className: 'btn-primary btn-large'
        }, isProcessing ? 'Processing...' : parseFloat(hlUsdcBalance) >= HYPERLIQUID.MIN_DEPOSIT_USDC ? 'Deposit More USDC' : 'Deposit to Hyperliquid')
      ),

      // Step 2: Builder Fee
      currentStep === 2 && React.createElement('div', { className: 'step-content' },
        React.createElement('h2', null, 'Approve Builder Fee'),
        React.createElement('p', { className: 'step-description' },
          `Approve a ${HYPERLIQUID.BUILDER_FEE_MAX} maximum builder fee to access EV+ trading features`
        ),
        React.createElement('div', { className: 'info-box' },
          React.createElement('div', { className: 'info-row' },
            React.createElement('span', null, 'Builder Address:'),
            React.createElement('code', null, `${CONTRACTS.BUILDER_ADDRESS.slice(0, 10)}...`)
          ),
          React.createElement('div', { className: 'info-row' },
            React.createElement('span', null, 'Max Fee:'),
            React.createElement('code', null, HYPERLIQUID.BUILDER_FEE_MAX)
          )
        ),
        React.createElement('button', {
          onClick: handleBuilderFee,
          disabled: isProcessing || !isConnected || !isArbitrum,
          className: 'btn-primary btn-large'
        }, isProcessing ? 'Approving...' : 'Approve Builder Fee')
      ),

      // Step 3: Create Agent
      currentStep === 3 && React.createElement('div', { className: 'step-content' },
        React.createElement('h2', null, 'Create Trading Agent'),
        React.createElement('p', { className: 'step-description' },
          'Generate a secure agent wallet for automated trading. Save your API credentials!'
        ),
        React.createElement('div', { className: 'info-box' },
          React.createElement('p', null, '• Secure random key generation'),
          React.createElement('p', null, '• Automatic agent approval'),
          React.createElement('p', null, '• API credentials provided')
        ),
        parseFloat(hlUsdcBalance) < 300 && React.createElement('div', { className: 'alert alert-info' },
          `Current balance: $${parseFloat(hlUsdcBalance).toFixed(2)} USDC. Consider depositing $300+ for optimal trading.`
        ),
        React.createElement('button', {
          onClick: handleCreateAgent,
          disabled: isProcessing,
          className: 'btn-primary btn-large'
        }, isProcessing ? 'Creating Agent...' : 'Create Trading Agent')
      ),

      // Step 4: Setup Complete
      currentStep === 4 && React.createElement('div', { className: 'step-content' },
        React.createElement('div', { className: 'success-banner' },
          React.createElement('div', { className: 'success-icon-large' }, 
            React.createElement('img', { src: 'icons/favicon/android-chrome-192x192.png', alt: 'Success' })
          ),
          React.createElement('h2', null, 'Setup Complete!'),
          React.createElement('p', { className: 'success-subtitle' }, 
            'Your EV+ trading agent is ready to use'
          )
        ),
        
        React.createElement('div', { className: 'credentials-box' },
          React.createElement('h3', null, 'Your Agent Credentials'),
          React.createElement('div', { className: 'credential-item' },
            React.createElement('div', { className: 'credential-label' }, 'User Address:'),
            React.createElement('code', { className: 'credential-value' }, 
              sessionStorage.getItem('agent_user_address') || walletAddress
            )
          ),
          React.createElement('div', { className: 'credential-item' },
            React.createElement('div', { className: 'credential-label' }, 'API Secret:'),
            React.createElement('div', { style: { position: 'relative' } },
              React.createElement('code', { className: 'credential-value secret' }, 
                showSecret 
                  ? (sessionStorage.getItem('agent_secret') || '...')
                  : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'
              ),
              React.createElement('button', {
                onClick: () => setShowSecret(!showSecret),
                className: 'reveal-btn',
                type: 'button'
              }, showSecret ? 'Hide' : 'Reveal')
            )
          ),
          React.createElement('div', { className: 'credential-item' },
            React.createElement('div', { className: 'credential-label' }, 'Agent Address:'),
            React.createElement('code', { className: 'credential-value' }, 
              sessionStorage.getItem('agent_address') || '...'
            )
          ),
          React.createElement('div', { className: 'credential-warning' },
            'Save these credentials securely - you won\'t be able to retrieve them later!'
          )
        ),

        React.createElement('div', { className: 'balance-section' },
          React.createElement('h3', null, 'Account Balance'),
          React.createElement('div', { className: 'balance-grid' },
            React.createElement('div', { className: 'balance-card' },
              React.createElement('div', { className: 'balance-label' }, 'Arbitrum'),
              React.createElement('div', { className: 'balance-value' }, `${usdcBalance} USDC`)
            ),
            React.createElement('div', { className: 'balance-card' },
              React.createElement('div', { className: 'balance-label' }, 'Hyperliquid'),
              React.createElement('div', { className: 'balance-value' }, `${hlUsdcBalance} USDC`)
            )
          ),
          parseFloat(hlUsdcBalance) < 300 && React.createElement('div', null,
            React.createElement('div', { className: 'alert alert-warning', style: { marginTop: '1rem' } },
              `Recommended: $300+ USDC for optimal trading. Current balance: $${parseFloat(hlUsdcBalance).toFixed(2)}`
            ),
            React.createElement('div', { className: 'info-box', style: { marginTop: '1rem' } },
              React.createElement('label', {
                style: {
                  display: 'block',
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  marginBottom: '0.5rem'
                }
              }, 'Deposit Amount (USDC)'),
              React.createElement('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
                React.createElement('input', {
                  type: 'number',
                  value: depositAmount,
                  onChange: (e) => setDepositAmount(e.target.value),
                  min: HYPERLIQUID.MIN_DEPOSIT_USDC,
                  max: usdcBalance,
                  step: '0.01',
                  placeholder: `Min: ${HYPERLIQUID.MIN_DEPOSIT_USDC}`,
                  style: {
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(87, 90, 94, 0.4)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    outline: 'none'
                  }
                }),
                React.createElement('button', {
                  onClick: () => setDepositAmount(usdcBalance),
                  className: 'btn-secondary',
                  type: 'button',
                  style: { padding: '0.75rem 1.25rem', margin: 0 }
                }, 'Max')
              ),
              React.createElement('p', {
                style: {
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  marginTop: '0.5rem',
                  marginBottom: 0
                }
              }, `Available: ${usdcBalance} USDC`)
            ),
            React.createElement('button', {
              onClick: handleDeposit,
              disabled: isProcessing || !depositAmount || parseFloat(depositAmount) < HYPERLIQUID.MIN_DEPOSIT_USDC || parseFloat(depositAmount) > parseFloat(usdcBalance),
              className: 'btn-primary',
              style: { marginTop: '1rem', width: '100%' }
            }, isProcessing ? 'Processing...' : 'Deposit More USDC')
          ),
          parseFloat(hlUsdcBalance) >= 300 && React.createElement('div', { className: 'alert alert-success', style: { marginTop: '1rem' } },
            'Your account is funded and ready for trading!'
          )
        )
      ),

      // Message Display
      message && React.createElement('div', {
        className: `alert alert-${messageType}`
      }, message),

      // Navigation
      React.createElement('div', { className: 'step-nav' },
        currentStep > 0 && React.createElement('button', {
          onClick: () => setCurrentStep(currentStep - 1),
          className: 'btn-secondary',
          disabled: isProcessing
        }, '← Back'),
        currentStep < 4 && React.createElement('button', {
          onClick: () => setCurrentStep(currentStep + 1),
          className: 'btn-secondary',
          disabled: isProcessing
        }, 'Next →')
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(EVPlusApp));
