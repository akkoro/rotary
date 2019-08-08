import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Attribute, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

export class WildcardAttribute <EntityType extends IEntity,
    StrategyType extends IStorageStrategy<EntityType, IAttribute<EntityType, StrategyType>>>
    extends Attribute<EntityType, StrategyType> implements IAttribute<EntityType, StrategyType> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = 'Wildcard';
    public compatibleStrategies = ['Relational'];

    public equals (value: string) {
        return {
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk',
            },
            ExpressionAttributeValues: {
                ':sk': this.strategy.target['tableName'].toUpperCase(),
            }
        };
    }

    public range () {
        throw new Error('Wildcard cannot be queried by range');
    }

    public match (): any {
        throw new Error('Wildcard attributes cannot be queried by match');
    }

    public loadKeyValue (item: any): any {
        return undefined;
    }

    public storeItem () {}

    public storeValue (value: any): string {
        return value as string;
    }

    public loadValue (value: string): any {
        return value;
    }

}
