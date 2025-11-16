import { TonClient, Address, beginCell, toNano } from '@ton/ton';
import { sign } from '@ton/crypto';
import nacl from 'tweetnacl';

// TON Client for testnet
const tonClient = new TonClient({
    endpoint: process.env.TON_API_URL || 'https://testnet.toncenter.com/api/v2/jsonRPC',
    apiKey: process.env.TON_API_KEY || ''
});

// Contract addresses (set after deployment)
const NODE_REGISTRY_ADDRESS = process.env.NODE_REGISTRY_ADDRESS;
const SESSION_MANAGER_ADDRESS = process.env.SESSION_MANAGER_ADDRESS;

// Backend signing keys
const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;
const BACKEND_PUBLIC_KEY = process.env.BACKEND_PUBLIC_KEY;

/**
 * Initialize TON client and verify contract addresses
 */
export function initTonClient() {
    if (!NODE_REGISTRY_ADDRESS || !SESSION_MANAGER_ADDRESS) {
        console.warn('⚠️  TON contract addresses not set in .env.local');
        console.warn('Deploy contracts first and update .env.local');
        return false;
    }

    if (!BACKEND_PRIVATE_KEY || !BACKEND_PUBLIC_KEY) {
        console.warn('⚠️  Backend signing keys not found');
        console.warn('Run: node src/utils/generateKeypair.js');
        return false;
    }

    console.log('✅ TON client initialized');
    console.log('   NodeRegistry:', NODE_REGISTRY_ADDRESS);
    console.log('   SessionManager:', SESSION_MANAGER_ADDRESS);
    return true;
}

/**
 * Get contract address objects
 */
export function getContractAddresses() {
    return {
        nodeRegistry: NODE_REGISTRY_ADDRESS ? Address.parse(NODE_REGISTRY_ADDRESS) : null,
        sessionManager: SESSION_MANAGER_ADDRESS ? Address.parse(SESSION_MANAGER_ADDRESS) : null
    };
}

/**
 * Call SessionManager to start a new VPN session
 * This should be called by the user's wallet, not the backend
 * Backend just prepares the transaction data
 *
 * @param {number} nodeId - VPN node ID
 * @param {string} depositAmount - Deposit in TON (e.g., "0.1")
 * @returns {object} Transaction data for user wallet
 */
export function prepareStartSessionTx(nodeId, depositAmount) {
    if (!SESSION_MANAGER_ADDRESS) {
        throw new Error('SessionManager address not configured');
    }

    // Build StartSession message
    const messageBody = beginCell()
        .storeUint(0x00000001, 32) // op code for StartSession (arbitrary for demo)
        .storeUint(nodeId, 32)
        .endCell();

    return {
        to: SESSION_MANAGER_ADDRESS,
        value: depositAmount,
        body: messageBody.toBoc().toString('base64'),
        stateInit: null
    };
}

/**
 * Sign usage data with backend private key
 * This signature proves the usage data is authentic
 *
 * @param {bigint} sessionId - Session ID
 * @param {bigint} usageBytes - Bytes used during session
 * @returns {object} Signature data
 */
export function signUsageData(sessionId, usageBytes) {
    if (!BACKEND_PRIVATE_KEY) {
        throw new Error('Backend private key not configured');
    }

    // Create the same data structure as in SessionManager contract
    const dataCell = beginCell()
        .storeUint(sessionId, 64)
        .storeUint(usageBytes, 64)
        .endCell();

    const dataHash = dataCell.hash();

    // Sign with Ed25519
    const privateKeyBytes = Buffer.from(BACKEND_PRIVATE_KEY, 'hex');
    const signature = nacl.sign.detached(dataHash, privateKeyBytes);

    return {
        signature: Buffer.from(signature).toString('base64'),
        signatureHex: Buffer.from(signature).toString('hex'),
        dataHash: dataHash.toString('hex')
    };
}

/**
 * Prepare EndSession transaction
 * Backend signs the usage data, then user/backend submits to contract
 *
 * @param {bigint} sessionId - Session ID
 * @param {bigint} usageBytes - Bytes used
 * @returns {object} Transaction data
 */
export function prepareEndSessionTx(sessionId, usageBytes) {
    if (!SESSION_MANAGER_ADDRESS) {
        throw new Error('SessionManager address not configured');
    }

    const { signature } = signUsageData(sessionId, usageBytes);
    const signatureSlice = Buffer.from(signature, 'base64');

    // Build EndSession message
    const messageBody = beginCell()
        .storeUint(0x00000002, 32) // op code for EndSession
        .storeUint(sessionId, 64)
        .storeUint(usageBytes, 64)
        .storeBuffer(signatureSlice)
        .endCell();

    return {
        to: SESSION_MANAGER_ADDRESS,
        value: '0.05', // Gas for transaction
        body: messageBody.toBoc().toString('base64'),
        stateInit: null,
        signedData: {
            sessionId: sessionId.toString(),
            usageBytes: usageBytes.toString(),
            signature: signature
        }
    };
}

/**
 * Get session information from SessionManager contract
 *
 * @param {bigint} sessionId - Session ID
 * @returns {Promise<object>} Session data
 */
export async function getSession(sessionId) {
    if (!SESSION_MANAGER_ADDRESS) {
        throw new Error('SessionManager address not configured');
    }

    try {
        const address = Address.parse(SESSION_MANAGER_ADDRESS);

        // Call get method on contract
        const result = await tonClient.runMethod(address, 'getSession', [
            { type: 'int', value: sessionId.toString() }
        ]);

        // Parse the returned tuple
        // This is a simplified version - adjust based on actual contract response
        return {
            sessionId: sessionId,
            exists: result.stack.length > 0,
            rawData: result
        };
    } catch (error) {
        console.error('Error getting session:', error.message);
        return null;
    }
}

/**
 * Get node information from NodeRegistry contract
 *
 * @param {number} nodeId - Node ID
 * @returns {Promise<object>} Node data
 */
export async function getNode(nodeId) {
    if (!NODE_REGISTRY_ADDRESS) {
        throw new Error('NodeRegistry address not configured');
    }

    try {
        const address = Address.parse(NODE_REGISTRY_ADDRESS);

        const result = await tonClient.runMethod(address, 'getNode', [
            { type: 'int', value: nodeId.toString() }
        ]);

        return {
            nodeId: nodeId,
            exists: result.stack.length > 0,
            rawData: result
        };
    } catch (error) {
        console.error('Error getting node:', error.message);
        return null;
    }
}

/**
 * Estimate cost for a session based on usage
 *
 * @param {bigint} usageBytes - Bytes used
 * @param {bigint} pricePerByte - Node's price per byte (nanoTON)
 * @returns {bigint} Estimated cost in nanoTON
 */
export function estimateCost(usageBytes, pricePerByte) {
    return usageBytes * pricePerByte;
}

/**
 * Convert TON to nanoTON
 */
export function tonToNano(ton) {
    return toNano(ton.toString());
}

/**
 * Convert nanoTON to TON
 */
export function nanoToTon(nanoton) {
    return Number(nanoton) / 1e9;
}

export default {
    initTonClient,
    getContractAddresses,
    prepareStartSessionTx,
    prepareEndSessionTx,
    signUsageData,
    getSession,
    getNode,
    estimateCost,
    tonToNano,
    nanoToTon,
    tonClient
};
