-- Concordanciador: índice FTS5 con trigramas (subcadenas en coreano y español, sin distinguir
-- mayúsculas ni tildes) sobre los textos de los segmentos, sincronizado con disparadores.
CREATE VIRTUAL TABLE `segment_texts_fts` USING fts5(
  text,
  content = 'segment_texts',
  content_rowid = 'id',
  tokenize = 'trigram remove_diacritics 1'
);
--> statement-breakpoint
CREATE TRIGGER `segment_texts_ai` AFTER INSERT ON `segment_texts` BEGIN
  INSERT INTO segment_texts_fts(rowid, text) VALUES (new.id, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER `segment_texts_ad` AFTER DELETE ON `segment_texts` BEGIN
  INSERT INTO segment_texts_fts(segment_texts_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
--> statement-breakpoint
CREATE TRIGGER `segment_texts_au` AFTER UPDATE OF `text` ON `segment_texts` BEGIN
  INSERT INTO segment_texts_fts(segment_texts_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO segment_texts_fts(rowid, text) VALUES (new.id, new.text);
END;
--> statement-breakpoint
-- Esquema de anotación inicial (editable).
INSERT OR IGNORE INTO `annotation_tags` (`id`, `parent_id`, `name`, `color`, `description`, `position`, `created_at`, `updated_at`) VALUES
  ('atag-techniques', NULL, 'Técnicas de traducción', '#6366f1', 'Clasificación de técnicas (Molina y Hurtado Albir)', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-loan', 'atag-techniques', 'Préstamo', '#6366f1', NULL, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-calque', 'atag-techniques', 'Calco', '#6366f1', NULL, 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-literal', 'atag-techniques', 'Traducción literal', '#6366f1', NULL, 3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-transposition', 'atag-techniques', 'Transposición', '#6366f1', NULL, 4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-modulation', 'atag-techniques', 'Modulación', '#6366f1', NULL, 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-equivalence', 'atag-techniques', 'Equivalente acuñado', '#6366f1', NULL, 6, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-adaptation', 'atag-techniques', 'Adaptación', '#6366f1', NULL, 7, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-amplification', 'atag-techniques', 'Ampliación', '#6366f1', NULL, 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-compression', 'atag-techniques', 'Compresión', '#6366f1', NULL, 9, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-omission', 'atag-techniques', 'Omisión', '#6366f1', NULL, 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-creation', 'atag-techniques', 'Creación discursiva', '#6366f1', NULL, 11, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-generalization', 'atag-techniques', 'Generalización', '#6366f1', NULL, 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-tech-particularization', 'atag-techniques', 'Particularización', '#6366f1', NULL, 13, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-honorifics', NULL, 'Honoríficos y tratamiento', '#ec4899', NULL, 14, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-hon-address', 'atag-honorifics', 'Tratamiento tú/usted', '#ec4899', NULL, 15, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-hon-suffix', 'atag-honorifics', 'Sufijos honoríficos (-님, -씨)', '#ec4899', NULL, 16, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-hon-level', 'atag-honorifics', 'Nivel de habla (반말/존댓말)', '#ec4899', NULL, 17, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-humor', NULL, 'Humor y juegos de palabras', '#f97316', NULL, 18, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-culture', NULL, 'Referencias culturales', '#14b8a6', NULL, 19, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-names', NULL, 'Nombres propios', '#3b82f6', NULL, 20, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-variation', NULL, 'Variación lingüística', '#8b5cf6', NULL, 21, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-var-dialect', 'atag-variation', 'Dialecto', '#8b5cf6', NULL, 22, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-var-colloquial', 'atag-variation', 'Registro coloquial', '#8b5cf6', NULL, 23, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-var-archaic', 'atag-variation', 'Arcaísmo', '#8b5cf6', NULL, 24, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-onomatopoeia', NULL, 'Onomatopeyas y mímesis', '#eab308', NULL, 25, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
  ('atag-error', NULL, 'Error o problema de traducción', '#ef4444', NULL, 26, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
