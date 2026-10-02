-- Índice de búsqueda global (Ctrl/Cmd+K). El texto se guarda normalizado (minúsculas, sin tildes)
-- y el tokenizador trigram permite buscar subcadenas en cualquier idioma, incluido el coreano.
CREATE VIRTUAL TABLE `search_index` USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title UNINDEXED,
  subtitle UNINDEXED,
  text,
  tokenize = 'trigram'
);
