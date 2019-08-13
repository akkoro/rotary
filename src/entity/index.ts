import * as Future from 'fluture';

export declare interface IEntity extends Storable, Loadable {
    id: string;
    tableName: string;
    tableType: string;
}

export type EntityConstructor = new(...args: any[]) => {};

export interface Storable {
    store: () => Future.FutureInstance<any, any>;
}

export interface Loadable {
    load: () => Future.FutureInstance<any, any>;
}

export * from './Entity';
