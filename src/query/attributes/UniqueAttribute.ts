import * as Future from 'fluture';
import {Attribute, IAttribute} from '../Attribute';
import {StorageStrategy} from '../StorageStrategy';

export class UniqueAttribute <EntityType, S extends StorageStrategy<EntityType>>
    extends Attribute<EntityType, S> implements IAttribute {

    public readonly indexName: string = 'sk-data-index';

    public equals (value: string) {
        return {
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk',
            },
            ExpressionAttributeValues: {
                ':sk': value,
            }
        };
    }

    public range () {
        throw new Error('Unique attributes cannot be queried by range');
    }

    public matchHierarchy (): any {
        throw new Error('Unique attributes cannot be queried by hierarchical match');
    }

    public loadKeyValue (item: any): any {
        return Future.of(item.sk);
    }

}
