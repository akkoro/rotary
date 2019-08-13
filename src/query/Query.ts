import * as Future from 'fluture';
import {FutureInstance} from 'fluture';
import {EntityConstructor, IEntity} from '../entity';
import {EntityStorageType, makeEntity} from '../entity';
import {Config} from '../index';
import {IAttribute} from './Attribute';
import {IStorageStrategy} from './StorageStrategy';
import {getAttributeType} from './util';

export interface RangeArgs { start?: any; end?: any; id?: any; }

export class Query<E extends IEntity, S extends IStorageStrategy<E, A>, A extends IAttribute<E, S>> {

    private readonly target: E = null;
    private readonly ctor: EntityConstructor = null;
    private readonly storageType: EntityStorageType;
    private readonly tableName: string;
    private readonly strategy: S;

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
            public equals (value: any) {
                const params = strategy.attributeEquals(attr, value);
                return Future.tryP(() => Config.db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

            public match (value: any) {
                const params = strategy.attributeMatches(attr, value);
                return Future.tryP(() => Config.db.query(params).promise())
                    .map(result => result.Items.map(item => strategy.loadEntity(item, attr)))
                    .chain((entities: Array<FutureInstance<any, E>>) => Future.parallel(2, entities))
                ;
            }

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

    public fetch () {
        return this.select('*').equals('*');
    }

}

export const StorageStrategies: {[name: string]: any} = {};
