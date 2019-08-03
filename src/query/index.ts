import {EntityConstructor} from '../entity';
import Query from './Query';

export interface FilterProps {
    expressionNames: {[key: string]: string};
    expressionValues: {[key: string]: string};
    expression: string;
}

export interface Executor<EntityType> {
    exec (filter?: FilterProps);
}

export function query<EntityType> (target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}

export * from './Condition';
export * from './Filter';
export * from './Key';
export * from './Query';
