-- Phase 7 sources: Discord and Freshdesk join the provider enum. Additive
-- enum values only; no table changes.
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'DISCORD';
ALTER TYPE "Provider" ADD VALUE IF NOT EXISTS 'FRESHDESK';
