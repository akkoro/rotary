import * as AWS from 'aws-sdk';
import * as Future from 'fluture';
import {IEntity, EntityConstructor, Storable} from './index';
import {Config, StorageStrategies} from '../index';
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

            public store () {
                const strategy = new StorageStrategies[this.tableType](this.constructor, this);
                return strategy.storeEntity(this);
            }

            public load () {
                if (this.id) {
                    const strategy = new StorageStrategies[this.tableType](this.constructor, this);
                    const attr = new (strategy.getKeyAttributeConstructor())('id', strategy);

                    const params = strategy.attributeEquals(attr, this.id);
                    return Future.tryP(() => db.query(params).promise())
                        .chain(result => strategy.loadEntity(result.Items[0], attr))
                    ;
                }

                Future.reject('Entity.load: entity has no id');
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
