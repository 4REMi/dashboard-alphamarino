-- OAuth 2.1 para el servidor MCP (/api/mcp) — para clientes que solo se
-- conectan con OAuth (ChatGPT). Convive con mcp_api_keys (081), que sigue
-- igual. Ver lib/mcp/oauth.ts y docs/agent-guides/mcp-server.md.
--
-- Nada de esto guarda secretos en claro: client secrets, códigos y tokens
-- se guardan como hash SHA-256. El servidor (route handlers) usa el cliente
-- service-role; la RLS solo abre lo que el propio empleado necesita ver y
-- revocar desde su perfil.

-- Clientes registrados por DCR (RFC 7591). Públicos (PKCE) o con secreto.
CREATE TABLE mcp_oauth_clients (
  client_id          TEXT PRIMARY KEY,
  client_name        TEXT NOT NULL,
  redirect_uris      TEXT[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  client_secret_hash TEXT,
  client_uri         TEXT,
  logo_uri           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Códigos de autorización: un solo uso (used_at) y vida corta (expires_at).
-- grant_id apunta a los tokens emitidos con el código, para revocarlos si
-- alguien intenta reusarlo.
CREATE TABLE mcp_oauth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT NOT NULL,
  resource       TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  grant_id       UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at);

-- Una fila = una conexión autorizada (lo que el empleado ve y revoca en su
-- perfil). Access y refresh token se rotan en la misma fila.
CREATE TABLE mcp_oauth_grants (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id          TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  profile_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scope              TEXT NOT NULL,
  access_token_hash  TEXT NOT NULL UNIQUE,
  access_expires_at  TIMESTAMPTZ NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ
);

CREATE INDEX idx_mcp_oauth_grants_profile ON mcp_oauth_grants(profile_id);

ALTER TABLE mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_oauth_grants  ENABLE ROW LEVEL SECURITY;

-- mcp_oauth_codes: sin políticas → solo service-role.

-- mcp_oauth_clients: cualquiera con sesión puede leer nombre/URIs (la
-- pantalla de conexiones muestra el nombre del cliente). El hash del
-- secreto queda fuera vía column privileges.
CREATE POLICY authenticated_select_mcp_oauth_clients ON mcp_oauth_clients
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON mcp_oauth_clients FROM anon, authenticated;
GRANT SELECT (client_id, client_name, client_uri, logo_uri, created_at) ON mcp_oauth_clients TO authenticated;

-- mcp_oauth_grants: solo el dueño ve y revoca sus conexiones (mismo
-- criterio que mcp_api_keys). Los hashes de tokens no se exponen.
CREATE POLICY owner_select_mcp_oauth_grants ON mcp_oauth_grants
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY owner_update_mcp_oauth_grants ON mcp_oauth_grants
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
REVOKE ALL ON mcp_oauth_grants FROM anon, authenticated;
GRANT SELECT (id, client_id, profile_id, scope, created_at, last_used_at, revoked_at, refresh_expires_at)
  ON mcp_oauth_grants TO authenticated;
GRANT UPDATE (revoked_at) ON mcp_oauth_grants TO authenticated;

REVOKE ALL ON mcp_oauth_codes FROM anon, authenticated;
