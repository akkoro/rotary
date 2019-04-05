import {EntityConstructor} from "../Entity";
import Query from "./Query";

export function query<EntityType>(target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}