import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Config} from '../../index';
import {SchemaRepository} from '../../Schema';
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
        const entity = this.strategy.target;
        return this.loadValue(item.data, entity, this.name);
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
        const attr = value || entity[key];
        const isComposite = Reflect.getMetadata('flag:composite', entity, key);

        if (typeof attr === 'object' && isComposite) {
            let composite: string = '';
            Object.keys(attr).reverse().forEach(k => {
                if (typeof attr[k] === 'object') {
                    throw new Error('cannot store nested composite attributes');
                }

                composite = `${composite}#${attr[k]}`;
            });

            if (Config.syncSchemaOnStore) {
                SchemaRepository.store(this.strategy.ctor, attr, key).fork(console.error, console.log);
            }

            return composite;
        }

        return attr;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        const isComposite = Reflect.getMetadata('flag:composite', target, key);

        if (typeof item === 'string' && (item as string).charAt(0) === '#' && isComposite) {
            return SchemaRepository.resolve(this.strategy.ctor, key)
                .map(SchemaRepository.getValueMapper(item))
            ;
        }

        if (typeof item[key] === 'string' && (item[key] as string).charAt(0) === '#' && isComposite) {
            return SchemaRepository.resolve(this.strategy.ctor, key)
                .map(SchemaRepository.getValueMapper(item[key]))
            ;
        }

        return Future.of(item[key]);
    }

}

AttributeTypes[AttributeTypeName] = SearchableAttribute;
