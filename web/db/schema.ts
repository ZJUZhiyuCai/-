// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const projects=sqliteTable('projects',{
  owner:text('owner').notNull(),id:text('id').notNull(),title:text('title').notNull(),
  revision:integer('revision').notNull(),objectKey:text('object_key').notNull(),
  history:text('history').notNull(),updatedAt:text('updated_at').notNull(),
  blockCount:integer('block_count').notNull(),archived:integer('archived').notNull().default(0),
},t=>[primaryKey({columns:[t.owner,t.id]})]);
