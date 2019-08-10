import {EntityConstructor, EntityStorageType, IEntity} from '../entity';
import {IAttribute} from './Attribute';

export interface IStorageStrategy<E extends IEntity, A extends IAttribute<E, IStorageStrategy<E, A>>> {

    readonly tableName: string;
    readonly storageType: string;
    readonly ctor: EntityConstructor;
    readonly target: E;

    makeEntity (item: any);
    getKeyAttributeConstructor ();

    attributeEquals <Attr extends IAttribute<E, this>> (attribute: Attr, value: string);
    attributeMatches <Attr extends IAttribute<E, this>> (attribute: Attr, value: any);
    attributeInRange <Attr extends IAttribute<E, this>> (attribute: Attr, args: {start?: any, end?: any});

    loadEntity (item: any, attribute: IAttribute<E, IStorageStrategy<E, A>>);
    storeEntity (entity: E, cascade?: boolean);
}

export class StorageStrategy<E extends IEntity> {

    public readonly tableName: string;
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

    public attributeEquals <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, value: string) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.equals(value)
        };
    }

    public attributeMatches <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, value: string) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.match(value)
        };
    }

    public attributeInRange <S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> (attribute: A, args: {start?: any, end?: any}) {
        return {
            TableName: this.tableName,
            IndexName: attribute.indexName,
            ...attribute.range(args)
        };
    }

}
