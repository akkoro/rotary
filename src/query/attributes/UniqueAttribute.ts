import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

const AttributeTypeName: string = 'Unique';
const CompatibleStrategies: string[] = ['Relational'];

export function Unique (target: any, key: string) {
    Reflect.defineMetadata('attr:type', AttributeTypeName, target, key);
}

export class UniqueAttribute <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>
    extends Attribute<E, S> implements IAttribute<E, S> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = AttributeTypeName;
    public compatibleStrategies = CompatibleStrategies;

    public equals (value: any) {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk',
            },
            ExpressionAttributeValues: {
                ':sk': this.storeValue(entity, this.name, value),
            }
        };
    }

    public loadKeyValue (item: any): any {
        return Future.of(item.sk);
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: this.storeValue(entity, this.name),
            data: '$nil'
        };

        // TODO: get ID attribute names from strategy
        Object.keys(entity).filter(key => key !== 'id' && key !== this.name).map(key => {
            item = this.storeAttribute(item, entity, key);
        });

        return item;
    }

}

AttributeTypes[AttributeTypeName] = UniqueAttribute;
