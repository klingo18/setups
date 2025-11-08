import * as hl from "https://esm.sh/@nktkas/hyperliquid";
import { createWalletClient, custom } from "https://esm.sh/viem";
import { useWallet, useChain } from './hooks.js';
import { CONTRACTS, HYPERLIQUID, MESSAGES, BRANDING } from './constants.js';

const { useState, useEffect } = React;

function BuilderFeeApproval() {
  // Use shared hooks
  const { walletStatus, walletAddress, walletClient, setWalletClient, connectWallet, isConnected } = useWallet();
  const { chainId, isArbitrum, switchToArbitrum } = useChain();
  
  const [responseMessage, setResponseMessage] = useState('');
  const [responseType, setResponseType] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Set up wallet client when wallet connects
  useEffect(() => {
    if (walletAddress && window.ethereum && !walletClient) {
      const client = createWalletClient({
        account: walletAddress,
        transport: custom(window.ethereum)
      });
      setWalletClient(client);
    }
  }, [walletAddress]);

  const approveBuilderFee = async () => {
    if (!walletClient) {
      setResponseMessage(MESSAGES.CONNECT_FIRST);
      setResponseType('error');
      return;
    }

    try {
      setIsApproving(true);
      setResponseMessage('');
      const transport = new hl.HttpTransport();

      const hlClient = new hl.ExchangeClient({
        transport,
        wallet: walletClient
      });

      const response = await hlClient.approveBuilderFee({
        builder: CONTRACTS.BUILDER_ADDRESS,
        maxFeeRate: HYPERLIQUID.BUILDER_FEE_MAX
      });

      setResponseMessage(MESSAGES.BUILDER_FEE_SUCCESS);
      setResponseType('success');

    } catch (error) {
      let errorMsg = error.message || 'Operation failed';
      
      // Clean up error message
      if (errorMsg.includes('Version:')) {
        errorMsg = errorMsg.split('Version:')[0].trim();
      }
      errorMsg = errorMsg.replace('Details: ', '');
      if (errorMsg.includes('User rejected') && errorMsg.includes('User rejected the request')) {
        errorMsg = 'User rejected the request';
      }
      
      setResponseMessage(`Approval Failed: ${errorMsg}`);
      setResponseType('error');
    } finally {
      setIsApproving(false);
    }
  };

  return React.createElement("div", { className: "container" },
    React.createElement("div", { className: "card" },
      React.createElement("h1", { className: "title" }, BRANDING.NAME),
      React.createElement("p", { className: "subtitle" }, "Builder Fee Approval"),
      
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
        React.createElement("p", { className: "subtitle" },
          `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        ),

      !isConnected &&
        React.createElement("button", {
          onClick: connectWallet,
          className: "button button-primary"
        }, "Connect Wallet"),

      React.createElement("button", {
        onClick: approveBuilderFee,
        disabled: !isConnected || !isArbitrum || isApproving,
        className: "button button-secondary"
      }, isApproving ? "Approving..." : `Approve Builder Fee (${HYPERLIQUID.BUILDER_FEE_MAX} Max)`),

      responseMessage &&
        React.createElement("div", {
          className: `message ${responseType}`
        }, responseMessage)
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(BuilderFeeApproval));