import * as Future from 'fluture';
import {EntityConstructor, IEntity, makeEntity} from '../../entity';
import {Config} from '../../index';
import {StorageStrategies} from '../Query';
import {Attribute, IAttribute} from '../Attribute';
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
    extends StorageStrategy<E, A> implements IStorageStrategy<E, A> {

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

}

StorageStrategies['Relational'] = RelationalStorageStrategy;
