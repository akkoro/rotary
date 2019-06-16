import * as Future from "fluture";

export declare interface IEntity {
    id: string;
    tableName: string;
}

// export type Attribute = string | object | undefined;
// export type Ref = IEntity | undefined;

export type EntityConstructor = { new(...args: any[]): {} };

export interface Storable {
    store: (cascade?: boolean) => Future.FutureInstance<any, any>;
}

export * from './Entity';