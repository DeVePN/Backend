import nacl from 'tweetnacl';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate Ed25519 keypair for backend signing
 * This will be used to sign usage reports before sending to SessionManager contract
 */
function generateBackendKeypair() {
    const keypair = nacl.sign.keyPair();

    const privateKey = Buffer.from(keypair.secretKey).toString('hex');
    const publicKey = Buffer.from(keypair.publicKey).toString('hex');
    const publicKeyInt = BigInt('0x' + publicKey);

    console.log('='.repeat(60));
    console.log('Backend Signing Keypair Generated');
    console.log('='.repeat(60));
    console.log('\nPrivate Key (hex):');
    console.log(privateKey);
    console.log('\nPublic Key (hex):');
    console.log(publicKey);
    console.log('\nPublic Key (bigint for smart contract):');
    console.log(publicKeyInt.toString());
    console.log('='.repeat(60));

    // Save to .env
    const envPath = path.join(__dirname, '../../.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Remove old keys if they exist
    envContent = envContent.replace(/BACKEND_PRIVATE_KEY=.*/g, '');
    envContent = envContent.replace(/BACKEND_PUBLIC_KEY=.*/g, '');
    envContent = envContent.replace(/BACKEND_PUBLIC_KEY_INT=.*/g, '');

    // Add new keys
    envContent += `\n# Backend signing keys (for TON smart contract)\n`;
    envContent += `BACKEND_PRIVATE_KEY=${privateKey}\n`;
    envContent += `BACKEND_PUBLIC_KEY=${publicKey}\n`;
    envContent += `BACKEND_PUBLIC_KEY_INT=${publicKeyInt.toString()}\n`;

    fs.writeFileSync(envPath, envContent.trim() + '\n');

    console.log('\n✅ Keys saved to Backend/.env');
    console.log('\n📝 NEXT STEPS:');
    console.log('1. Deploy SessionManager with public key (bigint):');
    console.log('   ' + publicKeyInt.toString());
    console.log('2. Set NODE_REGISTRY_ADDRESS and SESSION_MANAGER_ADDRESS in .env');
    console.log('3. Restart backend server');
}

// Run if called directly
if (fileURLToPath(import.meta.url) === process.argv[1]) {
    generateBackendKeypair();
}

export default generateBackendKeypair;
