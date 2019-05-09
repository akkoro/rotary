import * as AWS from "aws-sdk";
import {FutureInstance} from "fluture";
import * as Future from "fluture";
import {Config} from "./index";
import {SchemaRepository} from "./Schema";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();


declare interface Entity {
    id: string;
    tableName: string;
}

export type Attribute = string | object | undefined;
export type Ref = Entity | undefined;
export type EntityConstructor = { new(...args: any[]): {} };

export function Entity<T extends EntityConstructor>(constructor: T) {
    Reflect.defineMetadata('table:name', constructor.name, constructor);

    return class extends constructor {
        public readonly id: string;

        constructor(...args: any[]) {
            super(args);
            this.id = args[0];
        }

        public get tableName() {
            return Reflect.getMetadata('table:name', this.constructor);
        }

        // @ts-ignore
        public store(cascade?: boolean) {
            console.log(`Storing: ${this.tableName}`);
            console.log(`ID: ${this.id}`);

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
                        }
                    })
                }
            };

            return Future.parallel(2, schemaFutures).chain(() => Future.tryP(() => db.batchWrite(params).promise()));

            // TODO: if (cascade), call store() on all Ref's

        }
    }
}

/* name decorators */

export function Unique(target: any, key: string) {
    Reflect.defineMetadata('name:unique', key, target, key);
}

export function Searchable(target: any, key: string) {
    Reflect.defineMetadata('name:searchable', key, target, key);
}

export function Ref(type: EntityConstructor) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('name:ref', key, target, key);
        Reflect.defineMetadata('ref:target', type, target, key);
    }
}

// `any` type here since we check metadata for decoration at runtime
export function makeEntity(target: any) {
    if (!Reflect.hasMetadata('table:name', target)) {
        throw new Error('class has not been decorated with @Entity');
    }

    return (id: string) => {
        return new target(id) as typeof target;
    }
}

/* internal helpers */

function getRootItem(entity: Entity) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: entity.tableName.toUpperCase(),
        data: '$nil'
    };

    Object.keys(entity).filter(key => key !== 'id').forEach(key => {
        item = {
            ...item,
            [key]: isAttributeComposite(entity, key) ? attrToComposite(entity[key]) : entity[key]
        }
    });

    return item;
}

function getUniqueItem(entity: Entity, attr: string) {
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
        }
    });

    return item;
}

function getRefItem(entity: Entity, attr: string) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: `${entity[attr].tableName.toUpperCase()}#${entity[attr].id}`,
        data: `${entity.tableName.toUpperCase()}#${entity.id}`
    };

    Object.keys(entity).filter(key => key !== 'id' && key !== attr).forEach(key => {
        item = {
            ...item,
            [key]: typeof entity[key] === 'object' ? attrToComposite(entity[key]) : entity[key]
        }
    });

    return item;
}

function getSearchableItem(entity: Entity, attr: string) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: `${entity.tableName.toUpperCase()}:${attr}`,
        data: typeof entity[attr] === 'object' ? attrToComposite(entity[attr]) : entity[attr]
    };

    Object.keys(entity).filter(key => key !== 'id' && key !== attr).forEach(key => {
        item = {
            ...item,
            [key]: typeof entity[key] === 'object' ? attrToComposite(entity[key]) : entity[key]
        }
    });

    return item;
}

function isAttributeComposite(target: any, key: string) {
    if (Reflect.hasMetadata('ref:target', target, key)) {
        return false;
    }

    return (typeof target === 'object');
}

/* attribute to string */

export function attrToComposite(attr: object): string {
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