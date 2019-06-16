import * as AWS from 'aws-sdk';
import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {EntityConstructor} from '../entity';
import {EntityStorageType, makeEntity} from '../entity/Entity';
import {Config} from '../index';
import {SchemaRepository} from '../Schema';
import Key from './Key';
import Filter from './Filter';
import {Executor, FilterProps} from './index';

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
        const type = this.target['tableType'] as EntityStorageType;

        let pk, tableName;
        switch (type) {
            case EntityStorageType.Relational: {
                pk = `${this.target['tableName'].toUpperCase()}#${id}`;
                tableName = Config.tableName;
                break
            }

            case EntityStorageType.TimeSeries: {
                pk = id;
                tableName = `${Config.tableName}-${this.target['tableName'].toUpperCase()}`;
                break
            }
        }

        const params = {
            TableName: tableName,
            KeyConditionExpression: `#pk = :pk`,
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': pk
            },
            ScanIndexForward: false
        };

        return Future.tryP(() => db.query(params).promise())
            .chain(result => result.Items && result.Items.length
                ? Future.resolve(result.Items)
                : Future.reject(`Entity with id ${id} not found`))
            .map((items: any[]) => items.map(item => {
                const entity = makeEntity(this.ctor)(id, type === EntityStorageType.TimeSeries ? item.sk : undefined);

                Object.keys(item).filter(key => !['pk', 'sk', 'data'].includes(key))
                    .forEach(key => {
                        entity[key] = item[key];
                    });

                return entity;
            }));
    }

    public exec(filter?: FilterProps) {
        const sk = this.target['tableName'].toUpperCase();
        const params = {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: `#sk = :sk`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                ...(filter && filter.expressionNames)
            },
            ExpressionAttributeValues: {
                ':sk': sk,
                ...(filter && filter.expressionValues)
            },
            FilterExpression: filter && filter.expression
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
                                        .map(SchemaRepository.getValueMapper(item[key]))
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

                return Future.parallel(2, futures).chain(() => Future.of(entities));
            })
    }
}

export default Query;