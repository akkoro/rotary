import 'reflect-metadata';
import './query/strategies/RelationalStorageStrategy';
import './query/attributes/UniqueAttribute';
import * as AWS from 'aws-sdk';
import {query} from './query';
import {Unique} from './query/attributes/UniqueAttribute';
import {Searchable} from './query/attributes/SearchableAttribute';
import {Ref} from './query/attributes/RefAttribute';
import {Entity, IEntity, makeEntity} from './entity';

export class Config {
    public static tableName: string;
    public static storeDeepReferences: boolean = false;
    public static syncSchemaOnStore: boolean = true;
    public static enableDebugLogging: boolean = false;
    public static db = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});
}

export * from './entity';
export * from './query';
export * from './Meta';

// -- //

Config.tableName = 'rddb';
Config.syncSchemaOnStore = true; // Disable sync in production
Config.enableDebugLogging = true;

// @Entity(EntityStorageType.TimeSeries)
// class Content {
//     content: string;
//
//     @Searchable
//     type: string;
// }

// const c1 = makeEntity(Content)('c1', Date.now());
// c1.content = 'this is my content!';
// c1.type = 'T1';
// query(Content).with('type').equals('T1').exec()
//     .fork(console.error, console.log);
// query(User).select('name').match({last: 'Fandango'}).fork(console.error, console.log);

@Entity()
class Account {
    @Searchable()
    public type: string;
}

interface UserName {
    first: string;
    last: string;
}

interface UserAddress {
    city: string;
    country: string;
}

@Entity()
class User {
    @Unique
    public email: string;

    @Unique
    public phoneNumber: string;

    @Searchable({composite: true})
    public address: UserAddress;

    @Searchable({composite: true})
    public name: UserName;

    @Searchable({signed: true})
    public type: number;

    @Ref(Account)
    public account: Account;
}

// const acct = makeEntity(Account)({id: 'a1'}) as Account & IEntity;
// acct.type = 'personal';
// acct.store().fork(console.error, console.log);
//
// const user = makeEntity(User)({id: 'u19'}) as User & IEntity;
// user.type = 1;
// user.name = { first: 'Clem', last: 'Fandango' };
// user.account = acct;
// user.store().fork(console.error, console.log);

query(User)
    .select('name')
    .match({last: 'Fandango'})
    .fork(console.error, console.log)
;
