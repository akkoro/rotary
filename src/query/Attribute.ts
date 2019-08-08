import {EntityStorageType, IEntity} from '../entity';
import {WildcardAttribute} from './attributes/WildcardAttribute';
import {IStorageStrategy, StorageStrategy} from './StorageStrategy';

export interface AttributeDynamoParams {
    KeyConditionExpression?: string;
    ExpressionAttributeNames?: {[v: string]: string};
    ExpressionAttributeValues?: {[v: string]: string};
}

export type AttributeConstructor = new <EntityType extends IEntity, StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>>(name: string, strategy: StrategyType) => IAttribute<EntityType, StrategyType>;

export interface IAttribute<EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>> {

    readonly indexName?: string;
    readonly typeName: string;
    readonly name: string;
    readonly strategy: StrategyType;

    compatibleStrategies?: string[];

    equals (value: string): AttributeDynamoParams;
    range (): any;
    match (): any;

    loadKeyValue (item: any): any;
    storeValue (value: any): string;
    loadValue (value: string): any;
    storeItem ();
}

export class Attribute<E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>> {

    public readonly name: string;
    public readonly strategy: S;

    constructor (name: string, strategy: S) {
        this.name = name;
        this.strategy = strategy;
    }

    protected storeAttribute (item: any, entity: E, key: string) {
        const attr = getAttributeType(entity, key, this.strategy);
        return {
            ...item,
            [key]: attr ? attr.storeValue(entity[key]) : entity[key]
        };
    }

}

export const AttributeTypes: {[name: string]: AttributeConstructor} = {};

export function getAttributeType
<E extends IEntity, A extends IAttribute<E, S>, S extends IStorageStrategy<E, A>>
(target: E, attributeName: string, strategy: S): IAttribute<E, S> {

    if (attributeName === '*') {
        return new WildcardAttribute('*', strategy);
    }

    if (attributeName === 'id') {
        return new (strategy.getKeyAttributeConstructor())('id', strategy);
    }

    const attrType = Reflect.getMetadata('attr:type', target, attributeName);
    if (attrType) {
        return new AttributeTypes[attrType](attributeName, strategy);
    }

    return null;

}
