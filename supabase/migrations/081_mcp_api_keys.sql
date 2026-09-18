-- Personal API keys for the MCP server (/api/mcp) — one per employee, lets
-- an AI chat (Claude, etc.) act as that specific person, respecting the
-- same permissions as the dashboard. Never stores the plaintext key, only
-- a SHA-256 hash — the raw value is shown once at creation time and can't
-- be recovered afterward, same convention as any other API key system.
CREATE TABLE mcp_api_keys (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX idx_mcp_api_keys_profile ON mcp_api_keys(profile_id);

ALTER TABLE mcp_api_keys ENABLE ROW LEVEL SECURITY;

-- Owner-only — a key's existence/name/hash is only ever visible to the
-- person it belongs to, never to other employees or even admins (the MCP
-- server itself validates tokens via the service-role admin client, not
-- through these policies).
CREATE POLICY owner_select_mcp_api_keys ON mcp_api_keys
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY owner_insert_mcp_api_keys ON mcp_api_keys
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY owner_update_mcp_api_keys ON mcp_api_keys
  FOR UPDATE USING (profile_id = auth.uid());
