import {EntityConstructor} from '../entity';
import {Query} from './Query';

/**
 * Begin a query for Entities of the type of `target`.
 * @param target Constructor of an Entity
 * @see {@link Query} for details
 */
export function query (target: EntityConstructor) {
    return new Query(target, new target());
}

export * from './Query';
export * from './StorageStrategy';
export * from './Attribute';
