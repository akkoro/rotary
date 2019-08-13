import * as Future from 'fluture';
import {EntityConstructor, EntityStorageType, IEntity} from '../entity';
import {Config, RangeArgs} from '../index';
import {AttributeConstructor, IAttribute} from './Attribute';
import {FutureInstance} from 'fluture';
import {getAttributeType} from './util';

export interface IStorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>> {

    readonly tableName: string;
    readonly storageType: string;
    readonly ctor: EntityConstructor;
    readonly target: E;

    makeEntity (item: any): IEntity;
    getKeyAttributeConstructor (): AttributeConstructor;

    attributeEquals <Attr extends IAttribute<E, this>> (attribute: Attr, value: string);
    attributeMatches <Attr extends IAttribute<E, this>> (attribute: Attr, value: any);
    attributeInRange <Attr extends IAttribute<E, this>> (attribute: Attr, args: RangeArgs);

    loadEntity (item: any, queriedByAttribute: IAttribute<E, IStorageStrategy<E, A>>): FutureInstance<any, IEntity>;
    storeEntity (entity: E);
}

export class StorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>> {

    public readonly tableName: string;
    public readonly storageType: string;
    public readonly ctor: EntityConstructor;
    public readonly target: E;

    constructor (ctor: EntityConstructor, target: E) {
        this.ctor = ctor;
        this.target = target;

        this.storageType = this.target['tableType'] as EntityStorageType;
        // switch (this.storageType) {
        //     case EntityStorageType.Relational:
        //         this.tableName = Config.tableName;
        //         break;
        //
        //     case EntityStorageType.TimeSeries:
        //         this.tableName = `${Config.tableName}-${this.target['tableName'].toUpperCase()}`;
        //         break;
        // }
    }

    public attributeEquals <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, value: string) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.equals(value)
        };
    }

    public attributeMatches <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, value: string) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.match(value)
        };
    }

    public attributeInRange <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, args: RangeArgs) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.range(args)
        };
    }

    public makeEntity (item: any): IEntity {
        throw new Error('makeEntity: StorageStrategy must be subclassed');
    }

    public getKeyAttributeConstructor (): AttributeConstructor {
        throw new Error('getKeyAttributeConstructor: StorageStrategy must be subclassed');
    }

    public loadEntity (item: any, queriedByAttribute: IAttribute<E, IStorageStrategy<E, A>>) {
        const futures: Array<FutureInstance<any, any>> = [];
        const entity = this.makeEntity(item);

        Object.keys(item).filter((key) => !['pk', 'sk', 'data'].includes(key))
            .forEach(key => {
                const attr = getAttributeType(entity, key, this);
                if (attr) {
                    futures.push(attr.loadValue(item, entity, key).map(v => (entity[key] = v)));
                } else {
                    entity[key] = item[key];
                }
            });

        // Key values are stored differently for each attribute type
        const value = queriedByAttribute.loadKeyValue(item);
        if (value) {
            futures.push(value.map(keyValue => (entity[queriedByAttribute.name] = keyValue)));
        }

        return Future.parallel(4, futures).chain(() => Future.of(entity));
    }

    public storeEntity (entity: E) {
        if (entity['tableType'] !== this.storageType) {
            throw new Error(`attempted to store entity type ${entity.tableName} with ${this.storageType} strategy`);
        }

        const items: object[] = [];

        // For each attribute in the entity
        Object.keys(entity).forEach(key => {
            // Store attribute items if specified
            const attr = getAttributeType(entity, key, this);
            if (attr) {
                items.push(attr.storeItem());
            }
        });

        const params = {
            RequestItems: {
                [this.tableName]: items.filter(body => body !== undefined).map(body => {
                    return {
                        PutRequest: {
                            Item: body
                        }
                    };
                })
            }
        };

        return Future.tryP(() => Config.db.batchWrite(params).promise());
    }

}
