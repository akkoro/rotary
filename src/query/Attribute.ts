import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {IEntity} from '../entity';
import {IStorageStrategy} from './StorageStrategy';
import {getAttributeType} from './util';

export interface AttributeDynamoParams {
    KeyConditionExpression?: string;
    ExpressionAttributeNames?: {[v: string]: string};
    ExpressionAttributeValues?: {[v: string]: string};
}

export type AttributeConstructor = new <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>(name: string, strategy: S) => IAttribute<E, S>;

export interface IAttribute<E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>> {
    readonly indexName?: string;
    readonly typeName: string;
    readonly name: string;
    readonly strategy: S;

    compatibleStrategies?: string[];

    // TODO: narrow return types
    equals (value: any): AttributeDynamoParams;
    match (value: any): any;
    range (args: {start?: any, end?: any}): any;

    loadKeyValue (item: any): any;
    storeItem ();
    storeValue (target: E, key: string, value?: any): string;
    loadValue (item: any, target: E, key: string): FutureInstance<any, any>;
}

export class Attribute<E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>> {

    public readonly typeName: string;
    public readonly name: string;
    public readonly strategy: S;

    constructor (name: string, strategy: S) {
        this.name = name;
        this.strategy = strategy;
    }

    public equals (value: any): AttributeDynamoParams {
        throw new Error(`${this.typeName} attributes cannot be queried by equality`);
    }

    public match (value: any): any {
        throw new Error(`${this.typeName} attributes cannot be queried by match`);
    }

    public range (args: {start?: any, end?: any}) {
        // TODO: if this is a time series entity we can
        throw new Error(`${this.typeName} attributes cannot be queried by range`);
    }

    public storeValue (entity: E, key: string, value?: any): string {
        return value || entity[key] as string;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        return Future.of(item[key]);
    }

    protected storeAttribute (item: any, entity: E, key: string) {
        const attr = getAttributeType(entity, key, this.strategy);
        return {
            ...item,
            [key]: attr ? attr.storeValue(entity, key) : entity[key]
        };
    }

}

export const AttributeTypes: {[name: string]: AttributeConstructor} = {};
