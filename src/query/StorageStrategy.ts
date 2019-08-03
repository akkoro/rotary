import {EntityStorageType} from '../entity';
import {Config} from '../index';

export class StorageStrategy<EntityType> {

    public readonly tableName: string;
    public readonly storageType: string;
    private readonly target: EntityType;

    constructor (target: EntityType) {
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
