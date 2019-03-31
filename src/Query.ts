import * as AWS from "aws-sdk";
import {attrToComposite, EntityConstructor, makeEntity} from "./Entity";
import {Config} from "./index";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

interface ICondition<EntityType> {
    value: object|string;
    key: Key<EntityType>;
    query: Query<EntityType>;

    equals: object;
    filterByComposite: object;
    // contains: object;
    parseKeyValue: (item: object) => string;
}

class UniqueAttributeCondition<EntityType> implements ICondition<EntityType> {
    public value = null;
    public key = null;
    public query = null;

    public get equals(): object {
        const sk = this.value;
        return {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':sk': sk
            }
        };
    }

    // @ts-ignore
    public get filterByComposite(): object {
        throw new Error('Unique attributes must be queried by equals()');
    }

    public parseKeyValue(item: object): string {
        return item['sk'];
    }
}

class SearchableAttributeCondition<EntityType> implements ICondition<EntityType> {
    public value = null;
    public key = null;
    public query = null;

    public get equals(): object {
        const sk = `${this.query.target['tableName'].toUpperCase()}:${this.key.name}`;
        return {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: '#sk = :sk and #data = :data',
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data'
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ':data': (typeof this.value === 'object') ? attrToComposite(this.value) : this.value
            }
        };
    }

    public get filterByComposite(): object {
        const sk = `${this.query.target['tableName'].toUpperCase()}:${this.key.name}`;
        return {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: `#sk = :sk and begins_with(#data,:data)`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data'
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ':data': (typeof this.value === 'object') ? attrToComposite(this.value) : this.value
            }
        };
    }

    public parseKeyValue(item: object): string {
        return item['data'];
    }
}

class RefAttributeCondition<EntityType> implements ICondition<EntityType> {
    public value = null;
    public key = null;
    public query = null;

    public get equals() {
        const refTarget = Reflect.getMetadata('ref:target', this.query.target, this.key.name);

        const sk = `${refTarget.name.toUpperCase()}#${this.value}`;
        const data = `${this.query.target['tableName'].toUpperCase()}#`;

        return {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: '#sk = :sk and begins_with(#data,:data)',
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data'
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ':data': data
            }
        };
    }

    // @ts-ignore
    public get filterByComposite(): object {
        throw new Error('Ref attributes must be queried by equals()');
    }

    public parseKeyValue(item: object): string {
        const refTarget = Reflect.getMetadata('ref:target', this.query.target, this.key.name);

        // TODO: resolve entity or use proxy to fetch on property get
        return makeEntity(refTarget)(item['sk'].split('#')[1]);
    }
}

class Condition<EntityType, AttributeType extends ICondition<EntityType>> {
    public type: string;

    private _key: Key<EntityType>;
    private _query: Query<EntityType>;
    private _value: object|string;
    private readonly impl: AttributeType;

    constructor(impl: AttributeType) {
        this.impl = impl;
    }

    public get key() {
        return this._key;
    }

    public set key(key: Key<EntityType>) {
        this._key = key;
        this.impl.key = key;
    }

    public get query() {
        return this._query;
    }

    public set query(query: Query<EntityType>) {
        this._query = query;
        this.impl.query = query;
    }

    public get value() {
        return this._value;
    }

    public set value(v: object|string) {
        this._value = v;
        this.impl.value = v;
    }

    public async then(cb: (result: Array<EntityType>) => void) {
        if (this.query.target) {
            if (Reflect.hasMetadata('name:searchable', this.query.target, this.key.name)) {
                if (this.type === 'like') {
                    throw new Error('cannot query Searchable attributes by like()');
                }
            }

            const result = await db.query(this.impl[this.type]).promise();

            if (result.Items.length) {
                cb(result.Items.map(item => {
                    const entity = makeEntity(this.query['ctor'])(item['pk'].split('#')[1]);
                    Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                        .forEach(key => {
                            entity[key] = item[key];
                        });
                    entity[this._key.name] = this.impl.parseKeyValue(item);

                    return entity;
                }));
            }
        }
    }

    // private get like() {
    //     let filterBy = '';
    //     let values = {};
    //     if (typeof this.value === 'object') {
    //         Object.keys(this.value).forEach(key => {
    //             filterBy = `contains(#${this.key.name},:${key})${filterBy.length ? `or ${filterBy}` : ''}`;
    //             values = {
    //                 ...values,
    //                 [`:${key}`]: this.value[key]
    //             };
    //         });
    //     }
    //
    //     const sk = this.query.target['tableName'].toUpperCase();
    //     return {
    //         TableName: Config.tableName,
    //         IndexName: 'sk-data-index',
    //         KeyConditionExpression: `#sk = :sk`,
    //         ExpressionAttributeNames: {
    //             '#sk': 'sk',
    //             [`#${this.key.name}`]: `${this.key.name}`
    //         },
    //         ExpressionAttributeValues: {
    //             ':sk': sk,
    //             ...values
    //         },
    //         FilterExpression: filterBy
    //     };
    // }
}

class Key<EntityType> {
    public name: string;
    public query: Query<EntityType>;

    public equals(value: object|string) {
        const condition = this.baseCondition;
        condition.type = 'equals';
        condition.value = value;

        return condition;
    }

    public filterByComposite(value: object) {
        const condition = this.baseCondition;
        condition.type = 'filterByComposite';
        condition.value = value;

        return condition;
    }

    public like(value: object|string) {
        const condition = this.baseCondition;
        condition.type = 'like';
        condition.value = value;

        return condition;
    }

    private get baseCondition() {
        let condition;
        if (Reflect.hasMetadata('name:unique', this.query.target, this.name)) {
            condition = new Condition(new UniqueAttributeCondition());
        } else if (Reflect.hasMetadata('name:searchable', this.query.target, this.name)) {
            condition = new Condition(new SearchableAttributeCondition());
        } else if (Reflect.hasMetadata('name:ref', this.query.target, this.name)) {
            condition = new Condition(new RefAttributeCondition());
        }
        condition.key = this;
        condition.query = this.query;

        return condition;
    }
}

export class Query<EntityType> {
    private readonly ctor: EntityConstructor = null;
    public readonly target: EntityType = null;

    constructor(ctor: EntityConstructor, target: any) {
        this.ctor = ctor;
        this.target = target;
    }

    public with(attr: string) {
        const key = new Key();
        key.name = attr;
        key.query = this;

        return key;
    }

    public async byId(id: string, cb: (result: EntityType) => void) {
        const pk = `${this.target['tableName'].toUpperCase()}#${id}`;
        const params = {
            TableName: Config.tableName,
            KeyConditionExpression: `#pk = :pk`,
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': pk
            }
        };

        const result = await db.query(params).promise();
        if (result.Items && result.Items.length) {
            const item = result.Items[0];
            cb(makeEntity(this.ctor)(id));
        }
    }

    public async then(cb: (result: Array<EntityType>) => void) {
        const sk = this.target['tableName'].toUpperCase();
        const params = {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: `#sk = :sk`,
            ExpressionAttributeNames: {
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':sk': sk
            }
        };

        const result = await db.query(params).promise();
        cb(result.Items.map(item => {
            const entity = makeEntity(this.ctor)(item['pk'].split('#')[1]);
            Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                .forEach(key => {
                    if (Reflect.hasMetadata('ref:target', this.target, key)) {
                        const refTarget = Reflect.getMetadata('ref:target', this.target, key);
                        entity[key] = makeEntity(refTarget)(item[key]['id']);
                    } else {
                        entity[key] = item[key];
                    }
                });

            return entity;
        }));
    }
}

export function query<EntityType>(target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}