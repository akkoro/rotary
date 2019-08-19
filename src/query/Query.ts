import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {EntityConstructor, IEntity} from '../entity';
import {EntityStorageType, makeEntity} from '../entity';
import {Config} from '../index';
import {IAttribute} from './Attribute';
import {IStorageStrategy} from './StorageStrategy';
import {getAttributeType} from './util';

export interface RangeArgs { start?: any; end?: any; id?: any; }

/**
 * `Query` is essentially query builder for the very simple query 'language' provided by Rotary. It is not recommended
 * to instantiate this class directly, @see {@link query} instead.
 *
 * A Query instance is constructed for an Entity, similar to a 'repository' in TypeORM for example. The Entity type info
 * is used to derive the storage strategy for the query operations. All operations (equals, match, range) will return
 * a list of entities of the type of `ctor`.
 */
export class Query<E extends IEntity, S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> {

    private readonly target: E = null;
    private readonly ctor: EntityConstructor = null;
    private readonly storageType: EntityStorageType;
    private readonly tableName: string;
    private readonly strategy: S;

    /**
     * Create an instance of Query.
     * @param ctor The class constructor of the Entity to query
     * @param target An instance of the class instantiated by `ctor`
     */
    constructor (ctor: EntityConstructor, target: any) {
        this.ctor = ctor;
        this.target = target;
        this.storageType = this.target['tableType'] as EntityStorageType;
        this.tableName = this.target['tableName'];

        if (typeof StorageStrategies[this.storageType] === 'undefined') {
            throw new Error(`no storage strategy found for type ${this.storageType}`);
        }

        this.strategy = new StorageStrategies[this.storageType](ctor, target);
    }

    /**
     * Select an attribute to perform a query on, and return an instance of the operations class.
     * @param attributeName Name of an Entity attribute, 'id', or '*'.
     */
    public select (attributeName: string) {
        const strategy = this.strategy;
        const attr = getAttributeType(this.target, attributeName, strategy);

        if (!attr) {
            throw new Error('temporary nope');
        }

        if (attr.compatibleStrategies && !attr.compatibleStrategies.includes(this.storageType)) {
            throw new Error(`${this.storageType} storage strategy is incompatible with ${attr.typeName} attribute`);
        }

        return new (class {
            /**
             * Return all items where the `select()`ed attribute is equal to `value`
             * @param value
             */
            public equals (value: any) {
                const params = strategy.attributeEquals(attr, value);
                return Future.tryP(() => Config.db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

            /**
             * Return all items where `value` is a partial match to the value of the `select()`ed attribute.
             * The specifics of this operation are dependent on the type of attribute selected.
             * @param value
             */
            public match (value: any) {
                const params = strategy.attributeMatches(attr, value);
                return Future.tryP(() => Config.db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

            /**
             * Return all items where the value of the `select()`ed attribute is within the range specified by `start`
             * and `end`. At least one of `start` and `end` must be specified. If supported by the storage strategy
             * and/or attribute, specifying `id` will limit the returned items to those matching the id. The specifics
             * of this are dependent on the strategy and attribute type.
             * @param args
             */
            public range (args: RangeArgs) {
                // FIXME: this assumes the limitation of Searchable range (requiring two split queries)
                //        for ALL types of attribute/strategy
                const {start, end, id} = args;
                if (start < 0 && end > 0) {
                    return Future.both(this.range({start, end: -1, id}), this.range({start: 0, end, id}))
                        .map(r => {
                            const ret: any[] = [];
                            r.forEach((searchResult: any[]) => {
                                ret.push(...searchResult);
                            });
                            return ret;
                        })
                    ;
                }

                const params = strategy.attributeInRange(attr, args);
                return Future.tryP(() => Config.db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }
        })();
    }

    /**
     * Return all items
     */
    public fetch () {
        return this.select('*').equals('*');
    }

}

export const StorageStrategies: {[name: string]: any} = {};
