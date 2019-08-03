import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {EntityStorageType, IEntity, makeEntity} from '../entity';
import {Attribute, IAttribute} from './Attribute';
import {StorageStrategy} from './StorageStrategy';
import {SchemaRepository} from '../Schema';

export class QueryDriver <
    EntityType extends IEntity,
    AttributeType extends IAttribute,
    S extends StorageStrategy<EntityType>,
    A extends Attribute<EntityType, S>> {

    private readonly strategy: S;
    private readonly attribute: A & AttributeType;

    constructor (strategy: S, attribute: A & AttributeType) {
        this.strategy = strategy;
        this.attribute = attribute;
    }

    public attributeEquals (value: string) {
        switch (this.strategy.storageType) {
            case EntityStorageType.Relational:
                return {
                    TableName: this.strategy.tableName,
                    IndexName: this.attribute.indexName,
                    ...this.attribute.equals(value)
                };

            case EntityStorageType.TimeSeries:
                break;
        }
    }

    public attributeInRange () {
        switch (this.strategy.storageType) {
            case EntityStorageType.Relational:
                break;

            case EntityStorageType.TimeSeries:
                break;
        }
    }

    public loadEntity (item: any) {
        const futures: Array<FutureInstance<any, any>> = [];
        const entity = this.makeEntity(item);

        Object.keys(item).filter((key) => !['pk', 'sk', 'data'].includes(key))
            .forEach((key) => {
                if (typeof item[key] === 'string' && (item[key] as string).charAt(0) === '#') {
                    const f = SchemaRepository.resolve(this.strategy.ctor, key)
                        .map(SchemaRepository.getValueMapper(item[key]))
                        .map((keyValue) => {
                            entity[key] = keyValue;
                        });
                    futures.push(f);
                } else {
                    entity[key] = item[key];
                }
            });

        // Key values are stored differently for each attribute type
        futures.push(this.attribute.loadKeyValue(item).map(keyValue => entity[this.attribute.name] = keyValue));
        Future.parallel(2, futures).fork(console.error, console.log);

        return entity;
    }

    private makeEntity (item: any) {
        return this.strategy.storageType === EntityStorageType.Relational
            ? makeEntity(this.strategy.ctor)({id: item['pk'].split('#')[1]})
            : makeEntity(this.strategy.ctor)({id: item['pk'], timestamp: item['sk']})
        ;
    }

}
