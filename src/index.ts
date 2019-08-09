import 'reflect-metadata';
import './query/strategies/RelationalStorageStrategy';
import './query/attributes/UniqueAttribute';
import * as AWS from 'aws-sdk';
import {query} from './query';
import {Unique} from './query/attributes/UniqueAttribute';
import {Searchable} from './query/attributes/SearchableAttribute';
import {Ref, Entity} from './entity';

export class Config {
    public static tableName: string;
    public static storeDeepReferences: boolean = false;
    public static syncSchemaOnStore: boolean = true;
    public static enableDebugLogging: boolean = false;
    public static db = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});
}

export * from './entity';
export * from './query';
export * from './Schema';

// -- //

Config.tableName = 'rddb';
Config.syncSchemaOnStore = false; // Disable sync in production

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

    @Searchable(true)
    public address: UserAddress;

    @Searchable(true)
    public name: UserName;

    @Searchable()
    public type: string;

    @Ref(Account)
    public account: any;
}

// const f1 = query(User).select('phoneNumber').equals('tel:+445555555555');
// const f2 = query(User).select('id').equals('360b99c1-341f-4ad4-a8b9-1f63668f421f');
// Future.parallel(2, [f1, f2]).fork(console.error, console.log);
// query(User).fetch().fork(console.error, console.log);
query(User).select('name').match({last: 'Fandango'}).fork(console.error, console.log);

// Get user by exact name
// query(User).with('name').equals({first: 'Clem', last: 'Fandango'}).exec().fork(console.error, console.log);

// Get all users with the last name 'Bear'
// query(User).with('name').filterByComposite({last: 'Bear'}).exec(result => {
//     console.log(result);
// });
// query(User).with('name').filterByComposite({last: 'Bear'}).exec(() => {}).fork(console.error, console.log);

// Get a single user by ID
// query(User).byId('360b99c1-341f-4ad4-a8b9-1f63668f421f').fork(console.error, console.log);
// query(User).byId('u1').fork(console.error, console.log);

// Get a single user by their email
// query(User).with('email').equals('clem@scramblestudios.co.uk').exec(result => {
//     console.log(result);
// });

// query(User).filter('email').equalTo('clem@scramblestudios.co.uk').exec().fork(console.error, result => {
//     result.forEach(user => {
//         console.log(user);
//     })
// });

// Get all users belonging to Account ID b8c80039-1c35-42cc-8444-68cce76b4e0f
// query(User).with('account').equals('b8c80039-1c35-42cc-8444-68cce76b4e0f').exec().fork(console.error, console.log);

// const u = makeEntity(User)({id: 'u1'}) as User & IEntity;
// const a = makeEntity(Account)({id: 'a2'});
// u.email = 'test@gmail.com';
// u.account = a;
// u.store();
