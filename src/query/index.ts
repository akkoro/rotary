import {EntityConstructor} from '../entity';
import {Query} from './Query';

export function query (target: EntityConstructor) {
    return new Query(target, new target());
}

export * from './Query';
export * from './StorageStrategy';
export * from './Attribute';
