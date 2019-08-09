import * as AWS from 'aws-sdk';
import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {EntityConstructor, IEntity} from '../entity';
import {EntityStorageType, makeEntity} from '../entity';
import {Config} from '../index';
import {SchemaRepository} from '../Schema';
import {AttributeConstructor, AttributeTypes, getAttributeType, IAttribute} from './Attribute';
import {UniqueAttribute} from './attributes/UniqueAttribute';
import {WildcardAttribute} from './attributes/WildcardAttribute';
import Key from './Key';
import Filter from './Filter';
import {Executor, FilterProps} from './index';
import {IStorageStrategy} from './StorageStrategy';

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

export class Query<EntityType> implements Executor<EntityType> {
    public readonly target: EntityType = null;
    private readonly ctor: EntityConstructor = null;

    constructor (ctor: EntityConstructor, target: any) {
        this.ctor = ctor;
        this.target = target;
    }

    public with (attr: string) {
        const key = new Key();
        key.name = attr;
        key.query = this;

        return key;
    }

    public filter (attr: string) {
        const filter = new Filter();
        filter.name = attr;
        filter.executor = this;
        return filter;
    }

    public byId (id: string) {
        const type = this.target['tableType'] as EntityStorageType;

        let pk, tableName;
        switch (type) {
            case EntityStorageType.Relational: {
                pk = `${this.target['tableName'].toUpperCase()}#${id}`;
                tableName = Config.tableName;
                break;
            }

            case EntityStorageType.TimeSeries: {
                pk = id;
                tableName = `${Config.tableName}-${this.target['tableName'].toUpperCase()}`;
                break;
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
                return makeEntity(this.ctor)({id, timestamp: type === EntityStorageType.TimeSeries ? item.sk : undefined, json: item});
            }));
    }

    public exec (filter?: FilterProps) {
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
                                    futures.push(f);

                                } else {
                                    entity[key] = item[key];
                                }
                            }
                        });

                    return entity;
                });

                return Future.parallel(2, futures).chain(() => Future.of(entities));
            });
    }
}

export class Query2<E extends IEntity, S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> {

    private readonly target: E = null;
    private readonly ctor: EntityConstructor = null;
    private readonly storageType: EntityStorageType;
    private readonly tableName: string;
    private readonly strategy: S;

    constructor (ctor: EntityConstructor, target: any) {
        this.ctor = ctor;
        this.target = target;
        this.storageType = this.target['tableType'] as EntityStorageType;
        this.tableName = this.target['tableName'];

        if (typeof StorageStrategies[this.storageType] === 'undefined') {
            throw new Error(`no storage strategy found for type ${this.storageType}`);
        }

        this.strategy = new StorageStrategies[this.storageType](ctor, target);
    }

    public select (attributeName: string) {
        const strategy = this.strategy;
        const attr = getAttributeType(this.target, attributeName, strategy);

        if (!attr) {
            throw new Error('temporary nope');
        }

        if (attr.compatibleStrategies && !attr.compatibleStrategies.includes(this.storageType)) {
            throw new Error(`${this.storageType} storage strategy is incompatible with ${attr.typeName} attribute`);
        }

        return new (class {
            public equals (value: string) {
                const params = strategy.attributeEquals(attr, value);
                return Future.tryP(() => db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

            public match (value: any) {
                const params = strategy.attributeMatches(attr, value);
                return Future.tryP(() => db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

            public range (start: any, end?: any) {

            }
        })();
    }

    public fetch () {
        return this.select('*').equals('*');
    }

}

export const StorageStrategies: {[name: string]: any} = {};
