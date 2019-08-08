import * as Future from 'fluture';
import {attrToComposite, IEntity} from '../../entity';
import {Attribute, AttributeTypes, getAttributeType, IAttribute} from '../Attribute';
import {IStorageStrategy, StorageStrategy} from '../StorageStrategy';

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

    public equals (value: string) {
        return {
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk',
            },
            ExpressionAttributeValues: {
                ':sk': value,
            }
        };
    }

    public range () {
        throw new Error('Unique attributes cannot be queried by range');
    }

    public match (): any {
        throw new Error('Unique attributes cannot be queried by match');
    }

    public loadKeyValue (item: any): any {
        return Future.of(item.sk);
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: entity[this.name],
            data: '$nil'
        };

        // TODO: get ID attribute names from strategy
        Object.keys(entity).filter(key => key !== 'id' && key !== this.name).forEach(key => {
            item = this.storeAttribute(item, entity, key);
        });

        return item;
    }

    public storeValue (value: any): string {
        return value as string;
    }

    public loadValue (value: string): any {
        return value;
    }

}

AttributeTypes[AttributeTypeName] = UniqueAttribute;
