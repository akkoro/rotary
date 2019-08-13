import * as Future from 'fluture';
import {EntityConstructor, IEntity, makeEntity} from '../../entity';
import {Config, RangeArgs} from '../../index';
import {StorageStrategies} from '../Query';
import {Attribute, IAttribute} from '../Attribute';
import {IStorageStrategy, StorageStrategy} from '../StorageStrategy';

export class TimeSeriesKeyAttribute<EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>>
    extends Attribute<EntityType, StrategyType> implements IAttribute<EntityType, StrategyType> {

    public readonly typeName: string = 'TimeSeriesKey';

    public equals (value: any) {
        return {
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': value
            }
        };
    }

    public range (args: RangeArgs): any {
        const {start, end, id} = args;

        let op;
        if (start && end) {
            op = '#sk between :t1 and :t2';
        } else if (start && !end) {
            op = '#sk >= :t1';
        } else if (!start && end) {
            op = '#sk <= :t2';
        }

        return {
            KeyConditionExpression: `#pk = :pk and ${op}`,
            ExpressionAttributeNames: {
                '#pk': 'pk',
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':pk': id,
                ':t1': start,
                ':t2': end
            },
            // ScanIndexForward: true
        };
    }

    public loadKeyValue (item: any): any {
        return Future.of(item.pk);
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: entity.id,
            sk: entity.timestamp,
            data: '$nil'
        };

        // TODO: get ID attribute names from strategy
        //       OR use 'id' universally (since it's part of IEntity) and then have another list of reserved names
        Object.keys(entity)
            .filter(key => key !== 'id' && key !== 'timestamp')
            .forEach(key => {
                item = this.storeAttribute(item, entity, key);
            });

        return item;
    }
}

export class TimeSeriesStorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>>
    extends StorageStrategy<E, A> implements IStorageStrategy<E, A> {

    public readonly tableName: string;

    constructor (ctor: EntityConstructor, target: E) {
        super(ctor, target);
        this.tableName = `${Config.tableName}-${target.tableName.toUpperCase()}`;
    }

    public makeEntity (item: any) {
        return makeEntity(this.ctor)({id: item['pk'].split('#')[1], timestamp: item['sk']});
    }

    public getKeyAttributeConstructor () {
        return TimeSeriesKeyAttribute;
    }
}

StorageStrategies['TimeSeries'] = TimeSeriesStorageStrategy;
