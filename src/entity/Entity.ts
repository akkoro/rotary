import * as Future from 'fluture';
import {IEntity, EntityConstructor, Storable} from './index';
import {Config, StorageStrategies} from '../index';

export enum EntityStorageType {
    Relational = 'Relational',
    TimeSeries = 'TimeSeries'
}

export function Entity (type?: EntityStorageType) {
    return function <T extends EntityConstructor>(constructor: T) {
        Reflect.defineMetadata('table:name', constructor.name, constructor);
        Reflect.defineMetadata('table:type', type || EntityStorageType.Relational, constructor);

        return class extends constructor implements Storable {
            public readonly id: string;
            public readonly timestamp: number;

            constructor (...args: any[]) {
                super(args);
                this.id = args[0];

                if (args[1]) {
                    this.timestamp = args[1];
                }
            }

            public get tableName (): string {
                return Reflect.getMetadata('table:name', this.constructor);
            }

            public get tableType (): string {
                return Reflect.getMetadata('table:type', this.constructor);
            }

            public store () {
                const strategy = new StorageStrategies[this.tableType](this.constructor, this);
                return strategy.storeEntity(this);
            }

            public load () {
                if (this.id) {
                    const strategy = new StorageStrategies[this.tableType](this.constructor, this);
                    const attr = new (strategy.getKeyAttributeConstructor())('id', strategy);

                    const params = strategy.attributeEquals(attr, this.id);
                    return Future.tryP(() => Config.db.query(params).promise())
                        .chain(result => strategy.loadEntity(result.Items[0], attr))
                    ;
                }

                Future.reject('Entity.load: entity has no id');
            }
        };
    };
}

// `any` type here since we check metadata for decoration at runtime
export function makeEntity (target: any) {
    if (!Reflect.hasMetadata('table:name', target)) {
        throw new Error('class has not been decorated with @Entity');
    }

    return (args: {id: string, timestamp?: number, json?: object}): IEntity => {
        const t = new target(args.id, args.timestamp) as typeof target;
        if (args.json) {
            Object.keys(args.json)
                .filter(k => !['id', 'timestamp', 'pk', 'sk', 'data'].includes(k))
                .forEach(key => t[key] = args.json[key]);
        }

        return t;
    };
}
