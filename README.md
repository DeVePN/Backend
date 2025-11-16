# DeVPN Backend API

Decentralized peer-to-peer VPN network backend powered by WireGuard, TON blockchain micropayments, and Supabase PostgreSQL.

## Architecture Overview

The DeVPN backend provides REST API endpoints for:
- **Node Registry**: VPN node discovery and filtering
- **Session Management**: VPN session lifecycle (start/stop)
- **Payment Channels**: TON micropayment verification
- **WireGuard Config**: Automatic peer configuration generation

## Tech Stack

- **Framework**: Express.js
- **Database**: Supabase PostgreSQL (with connection pooling)
- **Blockchain**: TON Testnet
- **VPN Protocol**: WireGuard
- **Cryptography**: TweetNaCl (Curve25519)

## Prerequisites

- Node.js >= 18.0.0
- pnpm (package manager)
- Supabase account
- TON testnet wallet (for testing)

## Setup Instructions

### 1. Install Dependencies

```bash
cd Backend
pnpm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Server
NODE_ENV=development
PORT=3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database Connection Strings
DATABASE_URL=postgresql://postgres.pylqdtluyfrpkafpgnpt:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
DATABASE_READ_URL=postgresql://postgres.pylqdtluyfrpkafpgnpt:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# TON Blockchain
TON_NETWORK=testnet
TON_API_URL=https://testnet.toncenter.com/api/v2
TON_API_KEY=your-toncenter-api-key

# Payment Configuration
MIN_CHANNEL_BALANCE=1000000000
MIN_SESSION_UNIT_NANOTON=100000000
SESSION_UNIT_MINUTES=5
SESSION_UNIT_MB=10

# Security
CORS_ORIGIN=*
```

### 3. Setup Database

Run the database schema in your Supabase SQL Editor:

```bash
# Open Backend/database/schema.sql
# Copy and paste into Supabase SQL Editor
# Execute the SQL
```

This will create tables:
- `users` - User accounts
- `nodes` - VPN node registry
- `payment_channels` - TON payment channels
- `sessions` - Active VPN sessions
- `payments` - Transaction log

### 4. Run Development Server

```bash
pnpm dev
```

The API will be available at `http://localhost:3000`

### 5. Test the API

Health check:
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-15T...",
  "environment": "development"
}
```

## API Endpoints

### GET /api/health
Health check endpoint

### GET /api/nodes
Get filtered list of VPN nodes

**Query Parameters:**
- `region` - Filter by region (asia, europe, americas)
- `country` - Filter by country code
- `city` - Filter by city
- `min_price` - Minimum price per GB (nanoTON)
- `max_price` - Maximum price per GB (nanoTON)
- `max_load` - Maximum node load percentage (0-100)
- `version` - Node version
- `limit` - Max results to return

**Example:**
```bash
curl "http://localhost:3000/api/nodes?region=asia&max_load=50&limit=5"
```

### POST /api/node/register
Register a new VPN node provider

**Headers:**
- `x-wallet-address` - TON wallet address
- `x-wallet-signature` - Wallet signature (optional in dev mode)

**Body:**
```json
{
  "wg_public_key": "base64-encoded-public-key",
  "endpoint": "123.45.67.89:51820",
  "region": "asia",
  "country": "singapore",
  "city": "singapore",
  "price_per_gb": "1000000000",
  "price_per_minute": "100000000",
  "max_peers": 100,
  "bandwidth_mbps": 1000,
  "version": "1.0.0"
}
```

### POST /api/session/start
Start a VPN session

**Body:**
```json
{
  "telegram_id": "123456789",
  "node_id": "uuid-of-node",
  "ton_wallet_address": "EQD..."
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "session_token": "session_abc123...",
    "node": { ... },
    "client_ip": "10.8.0.42/24"
  },
  "wireguard_config": "[Interface]\n..."
}
```

### POST /api/session/stop
Stop an active VPN session

**Body:**
```json
{
  "session_token": "session_abc123..."
}
```

## Payment Flow

1. **Channel Check**: Backend verifies payment channel exists and has sufficient balance (min 5 minutes or 10MB worth)
2. **Immediate Start**: If funded, session starts immediately without waiting for payment
3. **Usage Tracking**: Session duration and data usage are tracked
4. **Cost Deduction**: On session stop, cost is calculated and deducted from payment channel balance

## Deployment to Railway

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
```

### 2. Login to Railway

```bash
railway login
```

### 3. Create New Project

```bash
railway init
```

### 4. Set Environment Variables

In Railway dashboard, add all environment variables from `.env.example`

### 5. Deploy

```bash
railway up
```

Railway will automatically:
- Detect the `railway.toml` configuration
- Install dependencies with pnpm
- Run `pnpm start` to start the server
- Monitor `/api/health` for health checks

## Project Structure

```
Backend/
├── src/
│   ├── controllers/       # Request handlers
│   │   ├── nodes.js      # Node registry endpoints
│   │   └── session.js    # Session management
│   ├── services/         # Business logic
│   │   ├── supabase.js   # Database operations
│   │   ├── keygen.js     # WireGuard key generation
│   │   ├── wg.js         # WireGuard config builder
│   │   ├── ton.js        # TON blockchain integration
│   │   ├── payment.js    # Payment channel logic
│   │   └── registry.js   # Node filtering/scoring
│   ├── middleware/       # Express middleware
│   │   ├── verifyWalletAuth.js
│   │   ├── validateRequest.js
│   │   └── errorHandler.js
│   ├── utils/           # Utilities
│   │   ├── env.js       # Environment validation
│   │   └── id.js        # ID generation
│   ├── routes.js        # API routes
│   └── index.js         # Express server
├── database/
│   └── schema.sql       # Supabase database schema
├── package.json
├── railway.toml         # Railway deployment config
└── .env.example         # Environment template
```

## Development Tips

### Enable Verbose Logging

Set in `.env.local`:
```env
LOG_LEVEL=debug
```

### Disable Wallet Authentication (Dev Only)

Leave wallet headers empty in development mode - the middleware will skip verification.

### Test Payment Channels

Use TON testnet faucet to get test TON:
https://testnet.tonscan.org/faucet

## Security Considerations

- **Wallet Authentication**: In production, implement proper TON Connect signature verification
- **Rate Limiting**: Add rate limiting middleware for production
- **CORS**: Configure specific origins instead of `*`
- **Environment Variables**: Never commit `.env.local` to git
- **SQL Injection**: All database queries use parameterized queries via Supabase
- **Input Validation**: All endpoints have request validation middleware

## Troubleshooting

### Database Connection Issues

- Verify Supabase credentials in `.env.local`
- Check connection pooler URLs (transaction vs session)
- Ensure IP allowlist in Supabase settings

### TON API Errors

- Verify TON_API_KEY is valid
- Check network (testnet vs mainnet)
- Review rate limits on TonCenter API

### WireGuard Node Communication

- Ensure node daemon is running on port 8080
- Verify firewall rules allow backend -> node communication
- Check node endpoint format (IP:PORT)

## Additional Endpoints (Suggested)

These can be added in future iterations:

- `GET /api/sessions/active` - Get user's active sessions
- `GET /api/nodes/:id/stats` - Get node performance metrics
- `POST /api/payment/channel/open` - Open new payment channel
- `GET /api/user/balance` - Check user's channel balances

## License

ISC

## Support

For issues and questions, create an issue on the GitHub repository.
