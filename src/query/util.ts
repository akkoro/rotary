import {IEntity} from '../entity';
import {AttributeTypes, IAttribute} from './Attribute';
import {IStorageStrategy} from './StorageStrategy';
import {WildcardAttribute} from './attributes/WildcardAttribute';

export function getAttributeType
<E extends IEntity, A extends IAttribute<E, S>, S extends IStorageStrategy<E, A>>
(target: E, attributeName: string, strategy: S): IAttribute<E, S> {

    if (attributeName === '*') {
        return new WildcardAttribute('*', strategy);
    }

    if (attributeName === 'id') {
        return new (strategy.getKeyAttributeConstructor())('id', strategy);
    }

    const attrType = Reflect.getMetadata('attr:type', target, attributeName);
    if (attrType) {
        return new AttributeTypes[attrType](attributeName, strategy);
    }

    // return Future.reject('no attribute type found for');
    return null;

}
