import {EntityConstructor} from "../Entity";
import Query from "./Query";

export type FilterProps = {
    expressionNames: {[key: string]: string};
    expressionValues: {[key: string]: string};
    expression: string;
}

export interface Executor<EntityType> {
    exec(cb: (result: Array<EntityType>) => void, filter?: FilterProps);
}

export function query<EntityType>(target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}