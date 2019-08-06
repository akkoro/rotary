import {EntityStorageType, IEntity} from '../entity';
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

    store ();
}

export class Attribute<EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>> {

    public readonly name: string;
    public readonly strategy: StrategyType;

    constructor (name: string, strategy: StrategyType) {
        this.name = name;
        this.strategy = strategy;
    }

}

export const AttributeTypes: {[name: string]: AttributeConstructor} = {};
