import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {attrToComposite, EntityConstructor, EntityStorageType, IEntity} from '../entity';
import {isAttributeComposite} from '../entity/helpers';
import {Config, SchemaRepository} from '../index';
import {AttributeTypes, IAttribute} from './Attribute';

export interface IStorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>> {

    readonly tableName: string;
    readonly storageType: string;
    readonly ctor: EntityConstructor;
    readonly target: E;

    makeEntity (item: any);
    getKeyAttribute ();

    attributeEquals <Attr extends IAttribute<E, this>> (attribute: Attr, value: string);
    attributeInRange ();

    loadEntity (item: any, attribute: IAttribute<E, IStorageStrategy<E, A>>);
    storeEntity (entity: E, cascade?: boolean);
}

export class StorageStrategy<E extends IEntity> {

    public readonly storageType: string;
    public readonly ctor: EntityConstructor;
    public readonly target: E;

    constructor (ctor: EntityConstructor, target: E) {
        this.ctor = ctor;
        this.target = target;

        this.storageType = this.target['tableType'] as EntityStorageType;
        // switch (this.storageType) {
        //     case EntityStorageType.Relational:
        //         this.tableName = Config.tableName;
        //         break;
        //
        //     case EntityStorageType.TimeSeries:
        //         this.tableName = `${Config.tableName}-${this.target['tableName'].toUpperCase()}`;
        //         break;
        // }
    }

}
