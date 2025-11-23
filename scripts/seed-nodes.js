import supabase from '../src/services/supabase.js';

/**
 * Seed script to populate the database with test nodes
 */
async function seedNodes() {
    const testNodes = [
        {
            owner_wallet: '0QDVj7LZYORmzg2ROnGpuP4pv-jOtIATm9Z11jz57EsqiRLf',
            wg_public_key: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
            endpoint: '45.76.123.45:51820',
            region: 'asia-pacific',
            country: 'Singapore',
            city: 'Singapore',
            price_per_gb: 0.5,
            price_per_minute: 0.001,
            max_peers: 100,
            bandwidth_mbps: 1000,
            current_load: 25,
            is_active: true,
            version: '1.0.0',
            metadata: { provider: 'test_seed', performance: 'high' }
        },
        {
            owner_wallet: '0QDVj7LZYORmzg2ROnGpuP4pv-jOtIATm9Z11jz57EsqiRLf',
            wg_public_key: 'z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1',
            endpoint: '104.224.78.12:51820',
            region: 'north-america',
            country: 'United States',
            city: 'New York',
            price_per_gb: 0.3,
            price_per_minute: 0.0008,
            max_peers: 150,
            bandwidth_mbps: 2000,
            current_load: 15,
            is_active: true,
            version: '1.0.0',
            metadata: { provider: 'test_seed', performance: 'high' }
        },
        {
            owner_wallet: '0QDVj7LZYORmzg2ROnGpuP4pv-jOtIATm9Z11jz57EsqiRLf',
            wg_public_key: 'p1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6',
            endpoint: '156.234.67.89:51820',
            region: 'europe',
            country: 'Germany',
            city: 'Frankfurt',
            price_per_gb: 0.4,
            price_per_minute: 0.0009,
            max_peers: 120,
            bandwidth_mbps: 1500,
            current_load: 10,
            is_active: true,
            version: '1.0.0',
            metadata: { provider: 'test_seed', performance: 'medium' }
        },
        {
            owner_wallet: '0QDVj7LZYORmzg2ROnGpuP4pv-jOtIATm9Z11jz57EsqiRLf',
            wg_public_key: 'o6n5m4l3k2j1i0h9g8f7e6d5c4b3a2z1y0x9w8v7u6t5s4r3q2p1',
            endpoint: '193.112.89.45:51820',
            region: 'europe',
            country: 'United Kingdom',
            city: 'London',
            price_per_gb: 0.45,
            price_per_minute: 0.00095,
            max_peers: 100,
            bandwidth_mbps: 1200,
            current_load: 30,
            is_active: true,
            version: '1.0.0',
            metadata: { provider: 'test_seed', performance: 'medium' }
        },
        {
            owner_wallet: '0QDVj7LZYORmzg2ROnGpuP4pv-jOtIATm9Z11jz57EsqiRLf',
            wg_public_key: 'b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5a6',
            endpoint: '167.88.45.123:51820',
            region: 'asia-pacific',
            country: 'Japan',
            city: 'Tokyo',
            price_per_gb: 0.6,
            price_per_minute: 0.0012,
            max_peers: 80,
            bandwidth_mbps: 800,
            current_load: 40,
            is_active: true,
            version: '1.0.0',
            metadata: { provider: 'test_seed', performance: 'high' }
        }
    ];

    console.log('🌱 Seeding database with test nodes...\n');

    for (const node of testNodes) {
        console.log(`📍 Adding node: ${node.city}, ${node.country}`);
        const { data, error } = await supabase
            .from('nodes')
            .insert([node])
            .select()
            .single();

        if (error) {
            console.error(`❌ Error adding node ${node.city}:`, error.message);
        } else {
            console.log(`✅ Added node ID: ${data.id}`);
        }
    }

    console.log('\n✨ Seeding complete!');
    process.exit(0);
}

seedNodes().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
