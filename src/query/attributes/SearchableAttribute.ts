import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Config} from '../../index';
import {SchemaRepository} from '../../Schema';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

const AttributeTypeName: string = 'Searchable';
const CompatibleStrategies: string[] = ['Relational'];

function numberToString (v: number, maxValue: number) {
    return `${v < 0 ? '-' : '+'}0d${Math.abs(v).toString().padStart(maxValue.toString().length, '0')}`;
}

export function Searchable (args?: {composite?: boolean, maxValue?: number}) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('attr:type', AttributeTypeName, target, key);
        if (args) {
            Reflect.defineMetadata('flag:composite', args.composite, target, key);
            Reflect.defineMetadata('opt:maxValue', args.maxValue, target, key);
        }
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

    public range (args: {start?: any, end?: any}): any {
        const entity = this.strategy.target;

        const maxValue = Reflect.getMetadata('opt:maxValue', entity, this.name);
        let {start, end} = args;

        if (typeof start === 'number') {
            start = numberToString(start, maxValue);
        }

        if (typeof end === 'number') {
            end = numberToString(end, maxValue);
        }

        let op;
        if (start && end) {
            op = '#data between :t1 and :t2';
        } else if (start && !end) {
            op = '#data >= :t1';
        } else if (!start && end) {
            op = '#data <= :t2';
        }

        return {
            KeyConditionExpression: `#sk = :sk and ${op}`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':t1': start,
                ':t2': end
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
        const maxValue = Reflect.getMetadata('opt:maxValue', entity, key);

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

        if (typeof attr === 'number' && maxValue) {
            return numberToString(attr, maxValue);
        }

        return attr;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        const isComposite = Reflect.getMetadata('flag:composite', target, key);

        if (typeof item === 'string') {
            if ((item as string).startsWith('+0d')) {
                return Future.of(parseInt(item.slice(3), 10));
            }
            if ((item as string).startsWith('-0d')) {
                return Future.of(-parseInt(item.slice(3), 10));
            }
        }

        if (typeof item === 'string' && !((item as string).charAt(0) === '#' && isComposite)) {
            return Future.of(item);
        }

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

        if (typeof item[key] === 'string') {
            if ((item[key] as string).startsWith('+0d')) {
                return Future.of(parseInt(item[key].slice(3), 10));
            }
            if ((item[key] as string).startsWith('-0d')) {
                return Future.of(-parseInt(item[key].slice(3), 10));
            }
        }

        return Future.of(item[key]);
    }

}

AttributeTypes[AttributeTypeName] = SearchableAttribute;
