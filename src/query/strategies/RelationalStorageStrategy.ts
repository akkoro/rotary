import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {attrToComposite, EntityConstructor, IEntity, makeEntity} from '../../entity';
import {isAttributeComposite} from '../../entity/helpers';
import {Config, SchemaRepository} from '../../index';
import {StorageStrategies} from '../Query';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {IStorageStrategy, StorageStrategy} from '../StorageStrategy';

export class RelationalKeyAttribute<EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>>
    extends Attribute<EntityType, StrategyType> implements IAttribute<EntityType, StrategyType> {

    public readonly typeName: string = 'RelationalKey';

    public equals (value: string) {
        return {
            KeyConditionExpression: '#pk = :pk and #sk = :sk',
            ExpressionAttributeNames: {
                '#pk': 'pk',
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':pk': `${this.strategy.target['tableName'].toUpperCase()}#${value}`,
                ':sk': this.strategy.target['tableName'].toUpperCase()
            },
            Limit: 1,
            ScanIndexForward: false
        };
    }

    public range () {
        // TODO: if this is a time series entity we can
        throw new Error('Key attributes cannot be queried by range');
    }

    public match (): any {
        throw new Error('Key attributes cannot be queried by match');
    }

    public loadKeyValue (item: any): any {
        return Future.of(item.pk.slice(item.pk.indexOf('#') + 1));
    }

    public store () {}
}

export class RelationalStorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>>
    extends StorageStrategy<E> implements IStorageStrategy<E, A> {

    public readonly tableName: string;

    constructor (ctor: EntityConstructor, target: E) {
        super(ctor, target);
        this.tableName = Config.tableName;
    }

    public makeEntity (item: any) {
        return makeEntity(this.ctor)({id: item['pk'].split('#')[1]});
    }

    public getKeyAttribute () {
        return RelationalKeyAttribute;
    }

    public attributeEquals <Attr extends IAttribute<E, this>> (attribute: Attr, value: string) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.equals(value)
        };
    }

    public attributeInRange () {
    }

    public loadEntity (item: any, byAttribute: IAttribute<E, IStorageStrategy<E, A>>) {
        const futures: Array<FutureInstance<any, any>> = [];
        const entity = this.makeEntity(item);

        Object.keys(item).filter((key) => !['pk', 'sk', 'data'].includes(key))
            .forEach((key) => {
                if (typeof item[key] === 'string' && (item[key] as string).charAt(0) === '#') {
                    const f = SchemaRepository.resolve(this.ctor, key)
                        .map(SchemaRepository.getValueMapper(item[key]))
                        .map(keyValue => (entity[key] = keyValue))
                    ;

                    futures.push(f);
                } else {
                    entity[key] = item[key];
                }
            });

        // Key values are stored differently for each attribute type
        const value = byAttribute.loadKeyValue(item);
        if (value) {
            futures.push(value.map(keyValue => (entity[byAttribute.name] = keyValue)));
        }

        return Future.parallel(2, futures).chain(() => Future.of(entity));
    }

    public storeEntity (entity: E) {
        if (entity['tableType'] !== this.storageType) {
            throw new Error(`attempted to store entity type ${entity.tableName} with ${this.storageType} strategy`);
        }

        const items: object[] = [];

        // TODO: the root item can be moved to RelationalKeyAttribute.store()
        let rootItem = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: entity.tableName.toUpperCase(),
            data: '$nil'
        };

        const schema: Array<FutureInstance<any, any>> = [];
        let attributeValues = {};

        // For each attribute in the entity
        Object.keys(entity).filter(key => key !== 'id').forEach(key => {
            // Append attribute to the root item
            attributeValues = {
                ...attributeValues,
                [key]: isAttributeComposite(entity, key) ? attrToComposite(entity[key]) : entity[key]
            };

            // Store schema for attribute if it is a composite attribute
            if (isAttributeComposite(entity, key) && Config.syncSchemaOnStore) {
                schema.push(SchemaRepository.store(this.ctor, entity[key], key));
            }

            // Store attribute items if specified
            const attrType = Reflect.getMetadata('attr:type', entity, key);
            if (attrType) {
                const attr = new AttributeTypes[attrType](key, this);
                items.push(attr.store());
            }
        });

        rootItem = {...rootItem, ...attributeValues};
        items.push(rootItem);

        const params = {
            RequestItems: {
                [this.tableName]: items.map(body => {
                    return {
                        PutRequest: {
                            Item: body
                        }
                    };
                })
            }
        };

        return Future.parallel(2, schema)
            .chain(() => Future.tryP(() => Config.db.batchWrite(params).promise()))
        ;
    }

}

StorageStrategies['Relational'] = RelationalStorageStrategy;
