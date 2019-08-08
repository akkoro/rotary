import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Attribute, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

export class WildcardAttribute <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>
    extends Attribute<E, S> implements IAttribute<E, S> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = 'Wildcard';
    public compatibleStrategies = ['Relational'];

    public equals (value: string) {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk',
            },
            ExpressionAttributeValues: {
                ':sk': entity.tableName.toUpperCase(),
            }
        };
    }

    public loadKeyValue (item: any): any {
        return undefined;
    }

    public storeItem () {}

}
