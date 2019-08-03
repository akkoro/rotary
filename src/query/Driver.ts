import {IEntity} from '../entity';
import {Attribute, IAttribute} from './Attribute';
import {StorageStrategy} from './StorageStrategy';

export enum DriverOp {
    KeyEquals
}

export class Driver <
    EntityType extends IEntity,
    AttributeType extends IAttribute,
    S extends StorageStrategy<EntityType>,
    A extends Attribute<EntityType, S>> {

    private readonly strategy: S;
    private readonly attribute: A & AttributeType;

    constructor (strategy: S, attribute: A & AttributeType) {
        this.strategy = strategy;
        this.attribute = attribute;
    }

    public buildParameters (op: DriverOp) {
        switch (op) {
            case DriverOp.KeyEquals:
                return {
                    TableName: this.strategy.tableName,
                    IndexName: this.attribute.indexName,
                    ...this.attribute.equals()
                };

            default:
                return {};
        }
    }

}
