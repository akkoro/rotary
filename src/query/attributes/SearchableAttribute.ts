import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

const AttributeTypeName: string = 'Searchable';
const CompatibleStrategies: string[] = ['Relational'];

export function Searchable (composite?: boolean) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('attr:type', AttributeTypeName, target, key);
        Reflect.defineMetadata('flag:composite', composite, target, key);
    };
}

export class SearchableAttribute <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>
    extends Attribute<E, S> implements IAttribute<E, S> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = AttributeTypeName;
    public compatibleStrategies = CompatibleStrategies;

    public equals (value: any) {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: '#sk = :sk and #data = :data',
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':data': this.storeValue(this.strategy.target, this.name, value),
            },
        };
    }

    public match (value: any): any {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: `#sk = :sk and begins_with(#data,:data)`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':data': this.storeValue(this.strategy.target, this.name, value),
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
            sk: `${entity.tableName.toUpperCase()}:${this.name}`,
            data: this.storeValue(entity, this.name)
        };

        // TODO: get ID attribute names from strategy
        Object.keys(entity).filter(key => key !== 'id' && key !== this.name).forEach(key => {
            item = this.storeAttribute(item, entity, key);
        });

        return item;
    }

    public storeValue (entity: E, key: string, value?: any): string {
        return value || entity[key] as string;
    }

    public loadValue (item: any, target: E, key: string): any {
        return item[key];
    }

}

AttributeTypes[AttributeTypeName] = SearchableAttribute;
