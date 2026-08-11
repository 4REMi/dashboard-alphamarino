-- Notas de texto libre para el brief — cosas que el admin necesita dejar
-- explícitas (ej. "hay que usar este hook a fuerzas", "usar este video en
-- particular"). Texto libre, escrito por el admin, no generado por IA.

ALTER TABLE creative_briefs
  ADD COLUMN IF NOT EXISTS important_notes TEXT;
