import {EntityConstructor, EntityStorageType} from '../entity';
import {Config} from '../index';

export class StorageStrategy<EntityType> {

    public readonly tableName: string;
    public readonly storageType: string;
    public readonly ctor: EntityConstructor;
    public readonly target: EntityType;

    constructor (ctor: EntityConstructor, target: EntityType) {
        this.ctor = ctor;
        this.target = target;

        this.storageType = this.target['tableType'] as EntityStorageType;
        switch (this.storageType) {
            case EntityStorageType.Relational:
                this.tableName = Config.tableName;
                break;

            case EntityStorageType.TimeSeries:
                this.tableName = `${Config.tableName}-${this.target['tableName'].toUpperCase()}`;
                break;
        }
    }

}
