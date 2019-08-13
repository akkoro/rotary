import * as Future from 'fluture';
import {EntityConstructor, IEntity, makeEntity} from '../../entity';
import {IStorageStrategy} from '../StorageStrategy';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {FutureInstance} from 'fluture';

const AttributeTypeName: string = 'Ref';
const CompatibleStrategies: string[] = ['Relational'];

export function Ref (entity: EntityConstructor) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('attr:type', AttributeTypeName, target, key);
        Reflect.defineMetadata('ref:target', entity, target, key);
    };
}

export class RefAttribute <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>
    extends Attribute<E, S> implements IAttribute<E, S> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = AttributeTypeName;
    public compatibleStrategies = CompatibleStrategies;

    public loadKeyValue (item: any): any {
        const refTarget = Reflect.getMetadata('ref:target', this.strategy.target, this.name);

        // TODO: resolve entity or use proxy to fetch on property get
        return Future.of(makeEntity(refTarget)({id: item['sk'].split('#')[1]}));
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: `${entity[this.name].tableName.toUpperCase()}:${entity[this.name].id}`,
            data: `${entity.tableName.toUpperCase()}#${entity.id}`
        };

        // TODO: get ID attribute names from strategy
        Object.keys(entity).filter(key => key !== 'id' && key !== this.name).forEach(key => {
            item = this.storeAttribute(item, entity, key);
        });

        return item;
    }

    public storeValue (entity: E, key: string, value?: any): string {
        return entity[key].id;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        const refTarget = Reflect.getMetadata('ref:target', target, key);
        return Future.of(makeEntity(refTarget)({id: item[key]}));
    }

}

AttributeTypes[AttributeTypeName] = RefAttribute;
