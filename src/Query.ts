import * as AWS from "aws-sdk";
import {attrToComposite, makeEntity} from "./Entity";
import {DocumentClient} from "aws-sdk/lib/dynamodb/document_client";
import QueryInput = DocumentClient.QueryInput;

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

interface ICondition<EntityType> {
    value: object|string;
    key: Key<EntityType>;
    query: Query<EntityType>;

    equals: object;
    filterByComposite: object;
    // contains: object;
}

class UniqueAttributeCondition<EntityType> implements ICondition<EntityType> {
    public value = null;
    public key = null;
    public query = null;

    public get equals(): object {
        const sk = this.value;
        return {
            TableName: 'rddb',
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
}

class SearchableAttributeCondition<EntityType> implements ICondition<EntityType> {
    public value = null;
    public key = null;
    public query = null;

    public get equals(): object {
        const sk = `${this.query.target['tableName'].toUpperCase()}:${this.key.name}`;
        return {
            TableName: 'rddb',
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
            TableName: 'rddb',
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
            } else {
                throw new Error(`unable to query by attribute '${this.key.name}'`);
            }

            const params = this.impl[this.type];
            // console.log(params);

            const result = await db.query(params).promise();

            if (result.Items.length) {
                cb(result.Items.map(item => {
                    return makeEntity(this.query['ctor'])(item['pk'].split('#')[1]);
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
    //         TableName: 'rddb',
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
        }
        condition.key = this;
        condition.query = this.query;

        return condition;
    }
}

type EntityConstructor = { new(...args: any[]): {} };

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
            TableName: 'rddb',
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
            TableName: 'rddb',
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
            return makeEntity(this.ctor)(item['pk'].split('#')[1]);
        }));
    }
}

export function query<EntityType>(target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}