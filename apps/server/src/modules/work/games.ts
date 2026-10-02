import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gameInputSchema, gameUpdateSchema, idSchema, type Game } from '@l10n/shared';
import type { AppContext } from '../../context';
import { NotFoundError } from '../../lib/errors';
import { columns, decodeRow, insertRow, selectList, updateRow } from '../../lib/sql';
import { parse } from '../../lib/validate';
import { logActivity } from '../../services/activity';
import { indexEntity } from '../../services/search';
import { moveToTrash, registerTrashable } from '../../services/trash';

export const GAME_COLUMNS = columns({
  id: 'id',
  title: 'title',
  originalTitle: 'original_title',
  titleEs: 'title_es',
  titleEn: 'title_en',
  developer: 'developer',
  publisher: 'publisher',
  releaseYear: 'release_year',
  genres: { col: 'genres', json: true },
  platforms: { col: 'platforms', json: true },
  businessModel: 'business_model',
  pegi: 'pegi',
  status: 'status',
  website: 'website',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

const GAME_SELECT = `SELECT ${selectList(GAME_COLUMNS, 'g')},
  (SELECT COUNT(*) FROM projects p WHERE p.game_id = g.id AND p.deleted_at IS NULL) AS "projectCount",
  (SELECT COUNT(*) FROM jobs j JOIN projects p ON p.id = j.project_id
     WHERE p.game_id = g.id AND j.deleted_at IS NULL AND p.deleted_at IS NULL) AS "jobCount"
  FROM games g`;

function indexGame(ctx: AppContext, g: Game) {
  indexEntity(ctx, {
    entityType: 'game',
    entityId: g.id,
    title: g.title,
    subtitle: [g.originalTitle, g.developer, g.releaseYear].filter(Boolean).join(' · '),
    text: [g.titleEs, g.titleEn, g.publisher, g.genres.join(' '), g.platforms.join(' '), g.notes]
      .filter(Boolean)
      .join(' '),
  });
}

export function getGame(ctx: AppContext, id: string): Game {
  const row = ctx.sqlite.prepare(`${GAME_SELECT} WHERE g.id = ? AND g.deleted_at IS NULL`).get(id);
  if (!row) throw new NotFoundError('El juego');
  return decodeRow<Game>(GAME_COLUMNS, row as Record<string, unknown>);
}

export function listGames(ctx: AppContext): Game[] {
  return (
    ctx.sqlite
      .prepare(`${GAME_SELECT} WHERE g.deleted_at IS NULL ORDER BY lower(g.title)`)
      .all() as Record<string, unknown>[]
  ).map((r) => decodeRow<Game>(GAME_COLUMNS, r));
}

export function registerGameEntity(): void {
  registerTrashable({
    type: 'game',
    table: 'games',
    titleSql: 'title',
    onRestore: (ctx, id) => indexGame(ctx, getGame(ctx, id)),
  });
}

export async function gameRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const idParam = z.object({ id: idSchema });

  app.get('/api/games', async () => listGames(ctx));

  app.get('/api/games/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getGame(ctx, id);
  });

  app.post('/api/games', async (req, reply) => {
    const input = parse(gameInputSchema, req.body);
    const id = insertRow(ctx, 'games', GAME_COLUMNS, input);
    const game = getGame(ctx, id);
    indexGame(ctx, game);
    logActivity(ctx, {
      entityType: 'game',
      entityId: id,
      action: 'crear',
      summary: `Juego «${game.title}» añadido`,
    });
    reply.code(201);
    return game;
  });

  app.patch('/api/games/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const patch = parse(gameUpdateSchema, req.body);
    updateRow(ctx, 'games', GAME_COLUMNS, id, patch, { what: 'El juego' });
    const game = getGame(ctx, id);
    indexGame(ctx, game);
    return game;
  });

  app.delete('/api/games/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    moveToTrash(ctx, 'game', id);
    return { ok: true };
  });
}
