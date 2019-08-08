import {EntityStorageType, IEntity} from '../entity';
import {WildcardAttribute} from './attributes/WildcardAttribute';
import {IStorageStrategy, StorageStrategy} from './StorageStrategy';

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

    equals (value: any): AttributeDynamoParams;
    range (): any;
    match (value: any): any;

    loadKeyValue (item: any): any;
    storeItem ();
    storeValue (target: E, key: string, value?: any): string;
    loadValue (item: any, target: E, key: string): any;
}

export class Attribute<E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>> {

    public readonly typeName: string;
    public readonly name: string;
    public readonly strategy: S;

    constructor (name: string, strategy: S) {
        this.name = name;
        this.strategy = strategy;
    }

    public equals (value: any) {
        throw new Error(`${this.typeName} attributes cannot be queried by equality`);
    }

    public range () {
        // TODO: if this is a time series entity we can
        throw new Error(`${this.typeName} attributes cannot be queried by range`);
    }

    public match (value: any): any {
        throw new Error(`${this.typeName} attributes cannot be queried by match`);
    }

    public storeValue (entity: E, key: string, value?: any): string {
        return value || entity[key] as string;
    }

    public loadValue (item: any, target: E, key: string): any {
        return item[key];
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
