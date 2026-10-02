import { uuidv7 } from 'uuidv7';

/** Identificadores UUIDv7: únicos y ordenados por fecha de creación. */
export function newId(): string {
  return uuidv7();
}
