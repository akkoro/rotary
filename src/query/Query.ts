import * as AWS from "aws-sdk";
import {EntityConstructor, makeEntity} from "../Entity";
import {Config} from "../index";
import {SchemaRepository} from "../Schema";
import Key from "./Key";
import Filter from "./Filter";
import {Executor, FilterProps} from "./index";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

class Query<EntityType> implements Executor<EntityType> {
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

    public filter(attr: string) {
        const filter = new Filter();
        filter.name = attr;
        filter.executor = this;
        return filter;
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

    public async exec(cb: (result: Array<EntityType>) => void, filter?: FilterProps) {
        const sk = this.target['tableName'].toUpperCase();
        const params = {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: `#sk = :sk`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                ...filter.expressionNames
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ...filter.expressionValues
            },
            FilterExpression: filter.expression
        };

        const result = await db.query(params).promise();
        const promises: Array<Promise<any>> = [];
        const entities = result.Items.map(item => {
            const entity = makeEntity(this.ctor)(item['pk'].split('#')[1]);
            Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                .forEach(key => {
                    if (Reflect.hasMetadata('ref:target', this.target, key)) {
                        const refTarget = Reflect.getMetadata('ref:target', this.target, key);
                        entity[key] = makeEntity(refTarget)(item[key]['id']);
                    } else {
                        if ((item[key] as string).charAt(0) === '#') {
                            promises.push(new Promise((resolve, reject) => {
                                SchemaRepository.resolve(this.ctor, key)
                                    .then(SchemaRepository.getValueMapper(item[key], entity, key, resolve));
                            }));

                        } else {
                            entity[key] = item[key];
                        }
                    }
                });

            return entity;
        });

        await Promise.all(promises);
        cb(entities);
    }
}

export default Query;