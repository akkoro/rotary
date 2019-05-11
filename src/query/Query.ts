import * as AWS from "aws-sdk";
import {FutureInstance} from 'fluture';
import * as Future from "fluture";
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

    public byId(id: string) {
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

        // const result = await db.query(params).promise();
        // if (result.Items && result.Items.length) {
        //     const item = result.Items[0];
        //     cb(makeEntity(this.ctor)(id));
        // }
        return Future.tryP(() => db.query(params).promise())
            .chain(result => result.Items && result.Items.length ?
                Future.resolve(result.Items[0]) : Future.reject(`Entity with id ${id} not found`))
            .map(_item => makeEntity(this.ctor)(id));
    }

    public exec(filter?: FilterProps) {
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

        return Future.tryP(() => db.query(params).promise())
            .chain(result => {

                const futures: Array<FutureInstance<any, any>> = [];
                const entities = result.Items.map(item => {
                    const entity = makeEntity(this.ctor)(item['pk'].split('#')[1]);
                    Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                        .forEach(key => {
                            if (Reflect.hasMetadata('ref:target', this.target, key)) {
                                const refTarget = Reflect.getMetadata('ref:target', this.target, key);
                                entity[key] = makeEntity(refTarget)(item[key]['id']);
                            } else {
                                if (typeof item[key] === 'string' && (item[key] as string).charAt(0) === '#') {
                                    const f = SchemaRepository.resolve(this.ctor, key)
                                        .map(SchemaRepository.getValueMapper(item[key], key))
                                        .map(keyValue => {
                                            entity[key] = keyValue;
                                        });
                                    futures.push(f)

                                } else {
                                    entity[key] = item[key];
                                }
                            }
                        });

                    return entity;
                });

                return Future.parallel(2, futures)
                    .map(() => entities);
            })
    }
}

export default Query;