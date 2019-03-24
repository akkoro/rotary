import * as AWS from "aws-sdk";
import {attrToComposite, makeEntity} from "./Entity";
import {DocumentClient} from "aws-sdk/lib/dynamodb/document_client";
import QueryInput = DocumentClient.QueryInput;

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

// TODO: use as base class and specialize for each attribute type
class Condition<EntityType> {
    public type: string;
    public value: object|string;
    public key: Key<EntityType>;
    public query: Query<EntityType>;

    public async then(cb: (result: Array<EntityType>) => void) {
        if (this.query.target) {
            if (Reflect.hasMetadata('name:unique', this.query.target, this.key.name)) {
                if (this.type !== 'equals') {
                    throw new Error('Unique attributes must be queried by equals()');
                }

            } else if (Reflect.hasMetadata('name:searchable', this.query.target, this.key.name)) {
                if (this.type === 'like') {
                    throw new Error('cannot query Searchable attributes by like()');
                }
            } else {
                throw new Error(`unable to query by attribute '${this.key.name}'`);
            }

            const params = this[this.type];
            // console.log(params);

            const result = await db.query(params).promise();

            if (result.Items.length) {
                const item = result.Items[0];
                this.query.target['id'] = item['pk'].split('#')[1];
                cb([this.query.target]);
            }
        }
    }

    private get equals() {
        // FIXME: this doesn't work for Searchable
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

    private get filterBy() {
        let data;
        if (typeof this.value === 'object') {
            data = attrToComposite(this.value);
        } else {
            data = this.value;
        }

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
                ':data': data
            }
        };
    }

    private get like() {
        let filterBy = '';
        let values = {};
        if (typeof this.value === 'object') {
            Object.keys(this.value).forEach(key => {
                filterBy = `contains(#${this.key.name},:${key})${filterBy.length ? `or ${filterBy}` : ''}`;
                values = {
                    ...values,
                    [`:${key}`]: this.value[key]
                };
            });
        }

        const sk = this.query.target['tableName'].toUpperCase();
        return {
            TableName: 'rddb',
            IndexName: 'sk-data-index',
            KeyConditionExpression: `#sk = :sk`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                [`#${this.key.name}`]: `${this.key.name}`
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ...values
            },
            FilterExpression: filterBy
        };
    }
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

    public filterBy(value: object|string) {
        const condition = this.baseCondition;
        condition.type = 'filterBy';
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
        const condition = new Condition();
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

export function find<EntityType>(target: EntityConstructor): Query<EntityType> {
    return new Query(target, new target());
}