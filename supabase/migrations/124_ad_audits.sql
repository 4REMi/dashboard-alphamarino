-- ============================================================
-- 124_ad_audits.sql — Auditorías de cuentas publicitarias (Ad Lab)
-- ============================================================
-- La extensión de Chrome/Firefox lee campañas del Ads Manager con la sesión
-- de quien la usa (cuentas propias, de clientes o prestadas por prospectos)
-- y las manda aquí. Ver docs/agent-guides/auditorias.md.
--
-- Regla de diseño: se guardan CONTEOS CRUDOS por anuncio y por día, nunca
-- porcentajes. Las métricas (hook rate, hold rate, visita → carrito…) se
-- calculan al mostrarlas (lib/ad-audit/metrics.ts), así que cambiar una
-- fórmula recalcula todas las auditorías, incluidas las viejas.
--
-- RLS activado y SIN políticas: son datos sensibles de prospectos (gasto,
-- ventas). Todo se lee y escribe desde el servidor con el cliente admin,
-- después de verificar el permiso access_ad_lab.

CREATE TABLE IF NOT EXISTS audit_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id   TEXT NOT NULL UNIQUE,          -- sin "act_"
  name              TEXT NOT NULL,
  currency          TEXT,
  kind              TEXT NOT NULL DEFAULT 'prospect' CHECK (kind IN ('prospect', 'client')),
  last_captured_at  TIMESTAMPTZ,
  last_captured_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES audit_accounts(id) ON DELETE CASCADE,
  meta_campaign_id  TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  objective         TEXT,
  status            TEXT,
  period_since      DATE,                          -- período de la última captura
  period_until      DATE,
  captured_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_campaigns_account ON audit_campaigns(account_id);

CREATE TABLE IF NOT EXISTS audit_adsets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  meta_adset_id      TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  status             TEXT,
  optimization_goal  TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_adsets_campaign ON audit_adsets(campaign_id);

-- Un video, muchos anuncios: se guarda una sola vez. Es la versión ligera que
-- entrega la API de Meta (/{video_id}?fields=source) — suficiente para auditar.
CREATE TABLE IF NOT EXISTS audit_videos (
  meta_video_id     TEXT PRIMARY KEY,
  account_id        UUID REFERENCES audit_accounts(id) ON DELETE CASCADE,
  storage_path      TEXT,                          -- en el bucket ad-lab
  storage_url       TEXT,
  picture_url       TEXT,
  duration_sec      NUMERIC(8,2),
  mirror_error      TEXT,
  mirrored_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_ads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES audit_campaigns(id) ON DELETE CASCADE,
  adset_id          UUID REFERENCES audit_adsets(id) ON DELETE CASCADE,
  meta_ad_id        TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  status            TEXT,
  format            TEXT NOT NULL DEFAULT 'other' CHECK (format IN ('video', 'image', 'other')),
  meta_video_id     TEXT REFERENCES audit_videos(meta_video_id) ON DELETE SET NULL,
  image_url         TEXT,                          -- URL de Meta (caduca)
  cached_image_url  TEXT,                          -- copia en Storage
  landing_url       TEXT,
  body              TEXT,
  created_time      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_ads_campaign ON audit_ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_audit_ads_adset ON audit_ads(adset_id);

-- Conteos crudos por anuncio y día. Conversiones con atribución de 7 días
-- después del clic (la que se usa en todo el embudo de la auditoría).
CREATE TABLE IF NOT EXISTS audit_ad_daily (
  ad_id               UUID NOT NULL REFERENCES audit_ads(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  impressions         BIGINT  NOT NULL DEFAULT 0,
  spend               NUMERIC(14,2) NOT NULL DEFAULT 0,
  video_3s            BIGINT  NOT NULL DEFAULT 0,  -- reproducciones de 3 s
  video_p25           BIGINT  NOT NULL DEFAULT 0,
  video_p50           BIGINT  NOT NULL DEFAULT 0,
  video_p75           BIGINT  NOT NULL DEFAULT 0,
  video_p95           BIGINT  NOT NULL DEFAULT 0,
  video_p100          BIGINT  NOT NULL DEFAULT 0,
  thruplays           BIGINT  NOT NULL DEFAULT 0,
  outbound_clicks     BIGINT  NOT NULL DEFAULT 0,
  landing_page_views  BIGINT  NOT NULL DEFAULT 0,
  add_to_cart         BIGINT  NOT NULL DEFAULT 0,
  initiate_checkout   BIGINT  NOT NULL DEFAULT 0,
  purchases           BIGINT  NOT NULL DEFAULT 0,
  purchase_value      NUMERIC(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (ad_id, date)
);

-- Curva de retención del período (video_play_curve_actions de Meta):
-- 22 puntos, % de reproducciones que llegan a cada segundo/tramo.
CREATE TABLE IF NOT EXISTS audit_ad_retention (
  ad_id         UUID PRIMARY KEY REFERENCES audit_ads(id) ON DELETE CASCADE,
  period_since  DATE,
  period_until  DATE,
  curve         JSONB NOT NULL
);

-- Eventos que la cuenta no manda (ej. initiate_checkout): se marcan "no
-- medido" en vez de 0 %. Lo detecta la captura por campaña.
ALTER TABLE audit_campaigns ADD COLUMN IF NOT EXISTS missing_events TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE audit_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_adsets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_videos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_ads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_ad_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_ad_retention ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
