import { nowIso } from '../domain/dates';
import type { BaseRecord } from './types';

/** Adds id and timestamps. An `id` in `fields` wins (records keyed by a date or a food ref). */
export function newRecord<T extends object>(fields: T): T & BaseRecord {
  const now = nowIso();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields };
}

export function touched<T extends BaseRecord>(r: T): T {
  return { ...r, updatedAt: nowIso() };
}

/** Deleting only marks the record; nothing the user made is removed from the database. */
export function softDeleted<T extends BaseRecord>(r: T): T {
  const now = nowIso();
  return { ...r, updatedAt: now, deletedAt: now };
}

export const isLive = (r: { deletedAt?: string }): boolean => !r.deletedAt;
