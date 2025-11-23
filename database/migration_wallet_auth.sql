-- Migration: Update users table for wallet-only authentication
-- Run this in your Supabase SQL Editor

-- Step 1: Make telegram_id optional (if users table already exists with data)
-- This allows for wallet-only authentication
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

-- Step 2: Add last_login column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login'
  ) THEN
    ALTER TABLE users ADD COLUMN last_login TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- Step 3: Make ton_wallet_address unique if not already
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_ton_wallet_address_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_ton_wallet_address_key UNIQUE (ton_wallet_address);
  END IF;
END $$;

-- Step 4: Add index on wallet address for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(ton_wallet_address);

-- Note: We keep telegram_id as optional to support future Telegram+Wallet auth
-- but for now, wallet address is the primary authentication method
