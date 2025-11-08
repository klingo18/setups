// Hyperliquid Agent Wallet Creation Component
import { useWallet, useChain } from './hooks.js';
import { BRANDING, MESSAGES } from './constants.js';

const { useState } = React;

// Agent Creation Component
function HyperliquidAgentCreator() {
    const { walletAddress, connectWallet, isConnected } = useWallet();
    const { isArbitrum } = useChain();
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');

    const handleCreateAgent = async () => {
        if (!isConnected) {
            const connected = await connectWallet();
            if (!connected) return;
        }

        setIsProcessing(true);
        setMessage('');

        try {
            // Import required libraries dynamically
            const ethers = await import("https://esm.sh/ethers@6");
            const hl = await import("https://esm.sh/@nktkas/hyperliquid");

            // Generate new agent wallet
            const agentWallet = ethers.Wallet.createRandom();
            
            // Use MetaMask signer with SDK
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            // Create exchange client with MetaMask signer
            const exchClient = new hl.ExchangeClient({
                wallet: signer,
                transport: new hl.HttpTransport({ isTestnet: false })
            });

            // Approve the agent using SDK
            const result = await exchClient.approveAgent({
                agentAddress: agentWallet.address,
                agentName: "EV+ Trading Agent"
            });

            setMessage(`${MESSAGES.AGENT_CREATED}

API Key: ${walletAddress}
API Secret: ${agentWallet.privateKey}
Agent Address: ${agentWallet.address}`);
            setMessageType('success');

        } catch (error) {
            let errorMsg = error.message || 'Failed to create agent';
            if (errorMsg.includes('User rejected')) {
                errorMsg = 'User rejected the request';
            }
            setMessage(`Error: ${errorMsg}`);
            setMessageType('error');
        }
        
        setIsProcessing(false);
    };

    return React.createElement('div', { className: 'container' },
        React.createElement('div', { className: 'card' },
            React.createElement('h1', { className: 'title' }, BRANDING.NAME),
            React.createElement('p', { className: 'subtitle' }, 'Agent Wallet Creator'),

            isConnected && React.createElement('div', {
                style: { marginBottom: '15px', fontSize: '14px', textAlign: 'center', color: '#9CA3AF' }
            }, `Connected: ${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`),

            React.createElement('button', {
                onClick: handleCreateAgent,
                disabled: isProcessing,
                className: 'button button-primary'
            }, isProcessing ? 'Creating Agent...' : isConnected ? 'Create Trading Agent' : 'Connect Wallet & Create Agent'),

            message && React.createElement('div', {
                className: `message ${messageType}`,
                style: { whiteSpace: 'pre-line', fontSize: '0.875rem' }
            }, message)
        )
    );
}

// Render the component using React 18
const agentRoot = document.getElementById('agent-root');
if (agentRoot) {
    const root = ReactDOM.createRoot(agentRoot);
    root.render(React.createElement(HyperliquidAgentCreator));
}