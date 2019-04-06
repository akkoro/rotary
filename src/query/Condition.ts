import * as AWS from "aws-sdk";
import {Config} from "../index";
import {attrToComposite, makeEntity} from "../Entity";
import {SchemaRepository} from "../Schema";
import Query from "./Query";
import Key from "./Key";
import Filter from "./Filter";
import {Executor, FilterProps} from "./index";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

export interface ICondition<EntityType> {
    value: object|string;
    key: Key<EntityType>;
    query: Query<EntityType>;

    equals: object;
    filterByComposite: object;
    // contains: object;
    parseKeyValue: (item: object) => string;
}

class Condition<EntityType, AttributeType extends ICondition<EntityType>> implements Executor<EntityType> {
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

    public filter(attr: string) {
        const filter = new Filter();
        filter.name = attr;
        filter.executor = this;
        return filter;
    }

    public async exec(cb: (result: Array<EntityType>) => void, filter?: FilterProps) {
        if (this.query.target) {
            if (Reflect.hasMetadata('name:searchable', this.query.target, this.key.name)) {
                if (this.type === 'like') {
                    throw new Error('cannot query Searchable attributes by like()');
                }
            }

            let params = this.impl[this.type];
            if (filter) {
                params = {
                    ...params,
                    ExpressionAttributeNames: {
                        ...params.ExpressionAttributeNames,
                        ...filter.expressionNames
                    },
                    ExpressionAttributeValues: {
                        ...params.ExpressionAttributeValues,
                        ...filter.expressionValues
                    },
                    FilterExpression: filter.expression
                }
            }

            const result = await db.query(params).promise();

            if (result.Items.length) {
                const promises: Array<Promise<any>> = [];
                const entities = result.Items.map(item => {
                    // TODO: use ID and this.query.target.name to lookup in cache
                    const entity = makeEntity(this.query['ctor'])(item['pk'].split('#')[1]);

                    Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                        .forEach(key => {
                            if ((item[key] as string).charAt(0) === '#') {
                                promises.push(new Promise((resolve, reject) => {
                                    SchemaRepository.resolve(this.query['ctor'], key)
                                        .then(SchemaRepository.getValueMapper(item[key], entity, key, resolve));
                                }));

                            } else {
                                entity[key] = item[key];
                            }
                        });
                    entity[this._key.name] = this.impl.parseKeyValue(item);

                    return entity;
                });

                await Promise.all(promises);
                cb(entities);
            }
        }
    }
}

export class UniqueAttributeCondition<EntityType> implements ICondition<EntityType> {
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

export class SearchableAttributeCondition<EntityType> implements ICondition<EntityType> {
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

export class RefAttributeCondition<EntityType> implements ICondition<EntityType> {
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

export default Condition;