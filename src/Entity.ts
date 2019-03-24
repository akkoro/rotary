import * as AWS from "aws-sdk";
import * as md5 from "md5";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

declare interface Entity {
    id: string;
    tableName: string;
}

export type Attribute = string | object | undefined;
export type Ref = Entity | undefined;

export function Entity(name: string) {
    return function <T extends { new(...args: any[]): {} }>(constructor: T) {
        Reflect.defineMetadata('table:name', name, constructor);

        return class extends constructor {
            [attribute: string]: any;

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

                Object.keys(this).forEach(key => {
                    if (Reflect.hasMetadata('name:unique', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getUniqueItem(this, key));
                    }

                    if (Reflect.hasMetadata('name:searchable', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getSearchableItem(this, key));
                        if (attrIsComposite(key)) {
                            console.log(key.toUpperCase() + '-SCHEMA');
                            items.push(getSchemaItem(this, key));
                        }
                    }

                    if (Reflect.hasMetadata('name:ref', this, key)) {
                        console.log(key.toUpperCase());
                        items.push(getRefItem(this, key));
                    }
                });

                const params = {
                    RequestItems: {
                        'rddb': items.map(body => {
                            return {
                                PutRequest: {
                                    Item: body
                                }
                            }
                        })
                    }
                };

                db.batchWrite(params).promise().then(response => console.log(response))
                    .catch(e => console.log(e));

                // TODO: if (cascade), call store() on all Ref's

            }
        }
    };
}

/* name decorators */

export function Unique(target: any, key: string) {
    if (Reflect.hasMetadata('name:unique', target)) {
        throw new Error('entity already has unique name specified');
    }

    Reflect.defineMetadata('name:unique', key, target, key);
}

export function Searchable(target: any, key: string) {
    Reflect.defineMetadata('name:searchable', key, target, key);
}

export function Ref(target: any, key: string) {
    Reflect.defineMetadata('name:ref', key, target, key);
}

// `any` type here since we check metadata for decoration at runtime
export function makeEntity(target: any) {
    if (!Reflect.hasMetadata('table:name', target)) {
    // if (!target['tableName']) {
        throw new Error('class has not been decorated with @Entity');
    }

    return (id: string) => {
        return new target(id) as typeof target;
    }
}

/* internal helpers */

function attrIsComposite(attr: string): boolean {
    return typeof this[attr] === 'object';
}

function getRootItem(entity: Entity) {
    let item = {
        pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
        sk: entity.tableName.toUpperCase(),
        data: '$nil'
    };

    Object.keys(entity).filter(key => key !== 'id').forEach(key => {
        item = {
            ...item,
            [key]: typeof entity[key] === 'object' ? attrToComposite(entity[key]) : entity[key]
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
        data: '$nil'
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

function getSchemaItem(entity: Entity, attr: string) {
    // TODO: the schema of the composite name needs to be persisted here,
    //       or in an Entity.freeze() type of method to avoid extra put()s on each store()
    const schemaKey = `${entity.tableName.toUpperCase()}:${attr}`;
    const schema = attrToSchema(entity[attr]);

    return {
        pk: `$SCHEMA#${schemaKey}`,
        sk: md5(schema),
        data: schema
    }
}

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

export function attrToSchema(attr: object): string {
    let schema: string = '';
    Object.keys(attr).reverse().forEach(key => {
        // @ts-ignore
        if (typeof attr[key] === 'object') {
            throw new Error('cannot store nested composite attributes');
        }

        schema = `${schema}#${key}`;
    });
    return schema;
}