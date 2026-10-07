import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  document: text('document').notNull(),
  updatedAt: integer('updated_at').notNull()
}, table => [index('idx_games_updated_at').on(table.updatedAt)]);
