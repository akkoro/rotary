import * as AWS from 'aws-sdk';
import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {IEntity, EntityConstructor, Storable} from './index';
import {Config, StorageStrategies} from '../index';
import {SchemaRepository} from '../Schema';
import {isAttributeComposite} from './helpers';

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

export enum EntityStorageType {
    Relational = 'Relational',
    TimeSeries = 'TimeSeries'
}

export function Entity (type?: EntityStorageType) {
    return function <T extends EntityConstructor>(constructor: T) {
        Reflect.defineMetadata('table:name', constructor.name, constructor);
        Reflect.defineMetadata('table:type', type || EntityStorageType.Relational, constructor);

        return class extends constructor implements Storable {
            public readonly id: string;
            public readonly timestamp: number;

            constructor (...args: any[]) {
                super(args);
                this.id = args[0];

                if (args[1]) {
                    this.timestamp = args[1];
                }
            }

            public get tableName (): string {
                return Reflect.getMetadata('table:name', this.constructor);
            }

            public get tableType (): string {
                return Reflect.getMetadata('table:type', this.constructor);
            }

            // @ts-ignore
            public store (cascade?: boolean) {
                const strategy = new StorageStrategies[this.tableType](this.constructor, this);
                strategy.storeEntity(this);

                switch (this.tableType) {
                    case EntityStorageType.TimeSeries: {
                        return this.storeTimeSeries(cascade);
                    }

                    default:
                        throw new Error(`unknown entity type ${this.tableType}`);
                }
            }

            public storeRelational (cascade: boolean) {
                if (this.tableType === EntityStorageType.TimeSeries) {
                    throw new Error('attempted to store timeseries entity with storeRelational');
                }

                const items: object[] = [];

                items.push(getRootItem(this));

                const schemaFutures: Array<FutureInstance<any, any>> = [];
                Object.keys(this).forEach(key => {
                    if (Reflect.hasMetadata('name:unique', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getUniqueItem(this, key));
                    }

                    if (Reflect.hasMetadata('name:searchable', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getSearchableItem(this, key));

                        if (isAttributeComposite(this, key) && Config.syncSchemaOnStore) {
                            schemaFutures.push(SchemaRepository.store(constructor, this[key], key));
                        }
                    }

                    if (Reflect.hasMetadata('name:ref', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getRefItem(this, key));
                    }
                });

                const params = {
                    RequestItems: {
                        [Config.tableName]: items.map(body => {
                            return {
                                PutRequest: {
                                    Item: body
                                }
                            };
                        })
                    }
                };

                return Future.parallel(2, schemaFutures).chain(() => Future.tryP(() => db.batchWrite(params).promise()));

                // TODO: if (cascade), call store() on all Ref's
            }

            public storeTimeSeries (cascade: boolean) {
                if (this.tableType === EntityStorageType.Relational) {
                    throw new Error('attempted to store relational entity with storeTimeSeries');
                }

                let item: any = {
                    pk: this.id,
                    sk: this.timestamp
                };

                Object.keys(this).filter(key => key !== 'id' && key !== 'timestamp').forEach(key => {
                    item = {
                        ...item,
                        [key]: isAttributeComposite(this, key) ? attrToComposite(this[key]) : this[key]
                    };
                });

                const params = {
                    TableName: `${Config.tableName}-${this.tableName.toUpperCase()}`,
                    Item: item
                };

                return Future.tryP(() => db.put(params).promise());
            }
        };
    };
}

/* name decorators */

export function Unique (target: any, key: string) {
    Reflect.defineMetadata('name:unique', key, target, key);
}

export function Searchable (target: any, key: string) {
    Reflect.defineMetadata('name:searchable', key, target, key);
}

export function Ref (type: EntityConstructor) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('name:ref', key, target, key);
        Reflect.defineMetadata('ref:target', type, target, key);
    };
}

// `any` type here since we check metadata for decoration at runtime
export function makeEntity (target: any) {
    if (!Reflect.hasMetadata('table:name', target)) {
        throw new Error('class has not been decorated with @Entity');
    }

    return (args: {id: string, timestamp?: number, json?: object}): IEntity => {
        const t = new target(args.id, args.timestamp) as typeof target;
        if (args.json) {
            Object.keys(args.json)
                .filter(k => !['id', 'timestamp', 'pk', 'sk', 'data'].includes(k))
                .forEach(key => t[key] = args.json[key]);
        }

        return t;
    };
}

/* internal helpers */

function getRootItem (entity: IEntity) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: entity.tableName.toUpperCase(),
        data: '$nil'
    };

    Object.keys(entity).filter(key => key !== 'id').forEach(key => {
        item = {
            ...item,
            [key]: isAttributeComposite(entity, key) ? attrToComposite(entity[key]) : entity[key]
        };
    });

    return item;
}

function getUniqueItem (entity: IEntity, attr: string) {
    if (typeof this[attr] === 'object') {
        throw new Error('unique attributes must not be composite');
    }

    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: this[attr],
        data: '$nil'
    };

    Object.keys(this).filter(key => key !== 'id' && key !== attr).forEach(key => {
        item = {
            ...item,
            [key]: typeof this[key] === 'object' ? attrToComposite(this[key]) : this[key]
        };
    });

    return item;
}

function getRefItem (entity: IEntity, attr: string) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: `${entity[attr].tableName.toUpperCase()}#${entity[attr].id}`,
        data: `${entity.tableName.toUpperCase()}#${entity.id}`
    };

    Object.keys(entity).filter(key => key !== 'id' && key !== attr).forEach(key => {
        item = {
            ...item,
            [key]: typeof entity[key] === 'object' ? attrToComposite(entity[key]) : entity[key]
        };
    });

    return item;
}

function getSearchableItem (entity: IEntity, attr: string) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: `${entity.tableName.toUpperCase()}:${attr}`,
        data: typeof entity[attr] === 'object' ? attrToComposite(entity[attr]) : entity[attr]
    };

    Object.keys(entity).filter(key => key !== 'id' && key !== attr).forEach(key => {
        item = {
            ...item,
            [key]: typeof entity[key] === 'object' ? attrToComposite(entity[key]) : entity[key]
        };
    });

    return item;
}

/* attribute to string */

export function attrToComposite (attr: object): string {
    let composite: string = '';
    Object.keys(attr).reverse().forEach(key => {
        // @ts-ignore
        if (typeof attr[key] === 'object') {
            throw new Error('cannot store nested composite attributes');
        }

        // @ts-ignore
        composite = `${composite}#${attr[key]}`;
    });
    return composite;
}
