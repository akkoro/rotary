import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {attrToComposite, EntityConstructor, IEntity, makeEntity} from '../../entity';
import {isAttributeComposite} from '../../entity/helpers';
import {Config, SchemaRepository} from '../../index';
import {StorageStrategies} from '../Query';
import {Attribute, AttributeTypes, getAttributeType, IAttribute} from '../Attribute';
import {IStorageStrategy, StorageStrategy} from '../StorageStrategy';

export class RelationalKeyAttribute<EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>>
    extends Attribute<EntityType, StrategyType> implements IAttribute<EntityType, StrategyType> {

    public readonly typeName: string = 'RelationalKey';

    public equals (value: any) {
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

    public loadKeyValue (item: any): any {
        return Future.of(item.pk.slice(item.pk.indexOf('#') + 1));
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: entity.tableName.toUpperCase(),
            data: '$nil'
        };

        // TODO: get ID attribute names from strategy
        //       OR use 'id' universally (since it's part of IEntity) and then have another list of reserved names
        Object.keys(entity)
            .filter(key => key !== 'id')
            .forEach(key => {
                item = this.storeAttribute(item, entity, key);
            });

        return item;
    }
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

    public getKeyAttributeConstructor () {
        return RelationalKeyAttribute;
    }

    public loadEntity (item: any, queriedByAttribute: IAttribute<E, IStorageStrategy<E, A>>) {
        const futures: Array<FutureInstance<any, any>> = [];
        const entity = this.makeEntity(item);

        Object.keys(item).filter((key) => !['pk', 'sk', 'data'].includes(key))
            .forEach(key => {
                const attr = getAttributeType(entity, key, this);
                if (attr) {
                    futures.push(attr.loadValue(item, entity, key).map(v => (entity[key] = v)));
                } else {
                    entity[key] = item[key];
                }
            });

        // Key values are stored differently for each attribute type
        const value = queriedByAttribute.loadKeyValue(item);
        if (value) {
            futures.push(value.map(keyValue => (entity[queriedByAttribute.name] = keyValue)));
        }

        return Future.parallel(2, futures).chain(() => Future.of(entity));
    }

    public storeEntity (entity: E) {
        if (entity['tableType'] !== this.storageType) {
            throw new Error(`attempted to store entity type ${entity.tableName} with ${this.storageType} strategy`);
        }

        const items: object[] = [];

        // For each attribute in the entity
        Object.keys(entity).forEach(key => {
            // Store attribute items if specified
            const attr = getAttributeType(entity, key, this);
            if (attr) {
                items.push(attr.storeItem());
            }
        });

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

        return Future.tryP(() => Config.db.batchWrite(params).promise());
    }

}

StorageStrategies['Relational'] = RelationalStorageStrategy;
