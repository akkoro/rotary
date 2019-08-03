import {EntityStorageType} from '../entity';
import {StorageStrategy} from './StorageStrategy';

export interface AttributeDynamoParams {
    KeyConditionExpression?: string;
    ExpressionAttributeNames?: string;
    ExpressionAttributeValues?: string;
}

export interface IAttribute {
    readonly indexName?: string;
    equals (): AttributeDynamoParams;
}

export class Attribute<EntityType, S extends StorageStrategy<EntityType>> {

    private readonly strategy: S;
    private readonly name: string;

    constructor (name: string, target: EntityType, strategy: S) {
        this.name = name;
        this.strategy = strategy;
    }

}
