import * as Future from 'fluture';

export declare interface IEntity extends Storable {
    id: string;
    tableName: string;
    tableType: string;
}

export type EntityConstructor = new(...args: any[]) => {};

export interface Storable {
    store: (cascade?: boolean) => Future.FutureInstance<any, any>;
}

export * from './Entity';
