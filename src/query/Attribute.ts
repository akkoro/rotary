import {EntityStorageType} from '../entity';
import {StorageStrategy} from './StorageStrategy';

export interface AttributeDynamoParams {
    KeyConditionExpression?: string;
    ExpressionAttributeNames?: {[v: string]: string};
    ExpressionAttributeValues?: {[v: string]: string};
}

export interface IAttribute {
    readonly indexName?: string;
    equals (value: string): AttributeDynamoParams;
    range (): any;
    matchHierarchy (): any;
    loadKeyValue (item: any): any;
}

export class Attribute<EntityType, S extends StorageStrategy<EntityType>> {

    public readonly name: string;
    protected readonly strategy: S;

    constructor (name: string, strategy: S) {
        this.name = name;
        this.strategy = strategy;
    }

}
