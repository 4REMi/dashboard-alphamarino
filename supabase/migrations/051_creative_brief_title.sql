-- Hoy el "título" de un brief es solo una etiqueta armada al vuelo en la UI
-- (nombre de marca + fecha de creación) — nada se guarda ni es editable.
-- Se agrega un título opcional para que el admin lo nombre según el ángulo
-- o concepto real del brief, editable en cualquier momento.

ALTER TABLE creative_briefs
  ADD COLUMN IF NOT EXISTS title TEXT;
