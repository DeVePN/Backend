import { asyncHandler } from '../middleware/errorHandler.js';
import * as tonContract from '../services/tonContract.js';
import { getSessionByToken, createSession as dbCreateSession } from '../services/supabase.js';
import { generateSessionToken } from '../utils/id.js';

/**
 * POST /api/contract/session/start
 * Prepare a session start transaction for the user's wallet
 */
export const prepareSessionStart = asyncHandler(async (req, res) => {
    const { nodeId, depositTON, telegram_id } = req.body;

    if (!nodeId || !depositTON) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['nodeId', 'depositTON']
        });
    }

    // Prepare the transaction data for user's wallet
    const txData = tonContract.prepareStartSessionTx(nodeId, depositTON);

    // Generate session token for tracking (before blockchain confirmation)
    const sessionToken = generateSessionToken();

    res.json({
        success: true,
        message: 'Session start transaction prepared',
        transaction: {
            to: txData.to,
            value: depositTON + ' TON',
            payload: txData.body
        },
        sessionToken: sessionToken,
        instructions: [
            '1. User sends transaction from their TON wallet',
            '2. Contract creates session on-chain',
            '3. Backend gets sessionId from blockchain',
            '4. User receives WireGuard config'
        ]
    });
});

/**
 * POST /api/contract/session/end
 * Sign usage data and prepare transaction to end session
 */
export const prepareSessionEnd = asyncHandler(async (req, res) => {
    const { session_token } = req.body;

    if (!session_token) {
        return res.status(400).json({
            error: 'session_token is required'
        });
    }

    // Get session from database
    const session = await getSessionByToken(session_token);

    if (!session) {
        return res.status(404).json({
            error: 'Session not found'
        });
    }

    if (session.status !== 'active') {
        return res.status(400).json({
            error: 'Session is not active',
            current_status: session.status
        });
    }

    // Calculate usage (simplified for hackathon)
    const startTime = new Date(session.start_time).getTime();
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);

    // For demo: assume 1KB per second
    const usageBytes = BigInt(durationSeconds * 1024);

    // Calculate cost (1 nanoTON per byte - matching previous contract logic)
    // In production, fetch price from node/session
    const totalCost = usageBytes * 1n;

    // Get session ID from on-chain (for hackathon, use database ID as proxy)
    // In production, you'd query the blockchain to get the actual on-chain sessionId
    const sessionId = BigInt(session.id || 0);

    // Sign the usage data with backend private key
    const signedData = tonContract.signUsageData(sessionId, totalCost, usageBytes);

    // Prepare EndSession transaction
    const txData = tonContract.prepareEndSessionTx(sessionId, totalCost, usageBytes);

    res.json({
        success: true,
        message: 'Session end transaction prepared',
        session: {
            session_token: session_token,
            sessionId: sessionId.toString(),
            usageBytes: usageBytes.toString(),
            totalCost: totalCost.toString(),
            durationSeconds: durationSeconds
        },
        transaction: {
            to: txData.to,
            value: '0.05 TON',
            payload: txData.body
        },
        signedData: {
            signature: signedData.signature,
            dataHash: signedData.dataHash
        },
        instructions: [
            '1. Backend has signed the usage data',
            '2. Transaction can be sent from any wallet',
            '3. Contract verifies signature and processes refund',
            '4. Session marked as stopped in database'
        ]
    });
});

/**
 * POST /api/contract/sign-usage
 * Backend endpoint to sign usage data (for direct contract interaction)
 */
export const signUsage = asyncHandler(async (req, res) => {
    const { sessionId, usageBytes, totalCost } = req.body;

    if (!sessionId || !usageBytes) {
        return res.status(400).json({
            error: 'Missing required fields',
            required: ['sessionId', 'usageBytes']
        });
    }

    const sessionIdBigInt = BigInt(sessionId);
    const usageBytesBigInt = BigInt(usageBytes);
    // Default to 1 nanoTON per byte if not provided
    const totalCostBigInt = totalCost ? BigInt(totalCost) : usageBytesBigInt * 1n;

    const signedData = tonContract.signUsageData(sessionIdBigInt, totalCostBigInt, usageBytesBigInt);

    res.json({
        success: true,
        sessionId: sessionId,
        usageBytes: usageBytes,
        totalCost: totalCostBigInt.toString(),
        signature: signedData.signature,
        signatureHex: signedData.signatureHex,
        dataHash: signedData.dataHash
    });
});

/**
 * GET /api/contract/session/:sessionId
 * Get session information from blockchain
 */
export const getSessionFromChain = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    if (!sessionId) {
        return res.status(400).json({
            error: 'sessionId is required'
        });
    }

    const sessionData = await tonContract.getSession(BigInt(sessionId));

    if (!sessionData || !sessionData.exists) {
        return res.status(404).json({
            error: 'Session not found on blockchain'
        });
    }

    res.json({
        success: true,
        sessionId: sessionId,
        onChainData: sessionData
    });
});

/**
 * GET /api/contract/node/:nodeId
 * Get node information from blockchain
 */
export const getNodeFromChain = asyncHandler(async (req, res) => {
    const { nodeId } = req.params;

    if (!nodeId) {
        return res.status(400).json({
            error: 'nodeId is required'
        });
    }

    const nodeData = await tonContract.getNode(parseInt(nodeId));

    if (!nodeData || !nodeData.exists) {
        return res.status(404).json({
            error: 'Node not found on blockchain'
        });
    }

    res.json({
        success: true,
        nodeId: nodeId,
        onChainData: nodeData
    });
});

/**
 * GET /api/contract/status
 * Check TON contract integration status
 */
export const getContractStatus = asyncHandler(async (req, res) => {
    const isInitialized = tonContract.initTonClient();
    const addresses = tonContract.getContractAddresses();

    res.json({
        success: true,
        initialized: isInitialized,
        contracts: {
            nodeRegistry: addresses.nodeRegistry?.toString() || 'Not configured',
            sessionManager: addresses.sessionManager?.toString() || 'Not configured'
        },
        network: process.env.TON_NETWORK || 'testnet',
        apiUrl: process.env.TON_API_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC'
    });
});

export default {
    prepareSessionStart,
    prepareSessionEnd,
    signUsage,
    getSessionFromChain,
    getNodeFromChain,
    getContractStatus
};
