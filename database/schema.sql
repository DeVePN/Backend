-- DeVPN Database Schema for Supabase PostgreSQL
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id TEXT UNIQUE NOT NULL,
  ton_wallet_address TEXT,
  username TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Nodes table (VPN node providers)
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_wallet TEXT NOT NULL,
  wg_public_key TEXT UNIQUE NOT NULL,
  endpoint TEXT NOT NULL, -- IP:PORT
  region TEXT NOT NULL, -- e.g., "asia", "europe", "americas"
  country TEXT NOT NULL,
  city TEXT,
  price_per_gb BIGINT NOT NULL, -- in nanoTON
  price_per_minute BIGINT NOT NULL, -- in nanoTON
  current_load INTEGER DEFAULT 0, -- 0-100 percentage
  max_peers INTEGER DEFAULT 100,
  bandwidth_mbps INTEGER,
  version TEXT DEFAULT '1.0.0',
  is_active BOOLEAN DEFAULT true,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payment channels (TON payment channel state)
CREATE TABLE IF NOT EXISTS payment_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES nodes(id) ON DELETE CASCADE,
  channel_address TEXT UNIQUE NOT NULL,
  initial_balance BIGINT NOT NULL, -- in nanoTON
  current_balance BIGINT NOT NULL, -- in nanoTON
  status TEXT DEFAULT 'active', -- active, closed, expired
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, node_id)
);

-- Sessions table (active VPN connections)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  payment_channel_id UUID REFERENCES payment_channels(id) ON DELETE SET NULL,
  wg_client_private_key TEXT NOT NULL,
  wg_client_public_key TEXT NOT NULL,
  wg_server_public_key TEXT NOT NULL,
  wg_preshared_key TEXT,
  allowed_ips TEXT[] DEFAULT ARRAY['0.0.0.0/0', '::/0'],
  client_ip TEXT, -- Assigned IP in VPN network
  dns_servers TEXT[] DEFAULT ARRAY['1.1.1.1', '8.8.8.8'],
  status TEXT DEFAULT 'active', -- active, stopped, expired, failed
  start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP WITH TIME ZONE,
  data_used_bytes BIGINT DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  cost_nanoton BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Payments table (transaction log)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  payment_channel_id UUID REFERENCES payment_channels(id) ON DELETE SET NULL,
  user_wallet TEXT NOT NULL,
  node_wallet TEXT NOT NULL,
  amount BIGINT NOT NULL, -- in nanoTON
  tx_hash TEXT,
  payment_type TEXT DEFAULT 'session', -- session, channel_open, channel_close
  status TEXT DEFAULT 'pending', -- pending, confirmed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_ton_wallet ON users(ton_wallet_address);

CREATE INDEX IF NOT EXISTS idx_nodes_active ON nodes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_nodes_region ON nodes(region);
CREATE INDEX IF NOT EXISTS idx_nodes_country ON nodes(country);
CREATE INDEX IF NOT EXISTS idx_nodes_price_gb ON nodes(price_per_gb);
CREATE INDEX IF NOT EXISTS idx_nodes_load ON nodes(current_load);

CREATE INDEX IF NOT EXISTS idx_payment_channels_user ON payment_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_node ON payment_channels(node_id);
CREATE INDEX IF NOT EXISTS idx_payment_channels_status ON payment_channels(status);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_node ON sessions(node_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_channel ON payments(payment_channel_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nodes_updated_at BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Optional but recommended
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payment_channels ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (customize based on your needs)
-- CREATE POLICY "Users can view their own data" ON users
--   FOR SELECT USING (auth.uid()::text = telegram_id);

-- CREATE POLICY "Anyone can view active nodes" ON nodes
--   FOR SELECT USING (is_active = true);
