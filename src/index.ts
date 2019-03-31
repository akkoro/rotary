import "reflect-metadata";

import {query} from "./Query";
import {Attribute, Entity, makeEntity, Ref, Searchable, Unique} from "./Entity";

export class Config {
    public static tableName: string;
    public static storeDeepReferences: boolean = false;
}

// -- //

Config.tableName = 'rddb';

@Entity
class Account {
    @Searchable
    type: Attribute;
}

@Entity
class User {
    @Unique
    email: string;

    @Unique
    phoneNumber: Attribute;

    @Searchable
    address: Attribute;

    @Searchable
    name: Attribute;

    @Searchable
    type: Attribute;

    @Ref(Account)
    account: Ref;
}

// Get user by exact name
// query(User).with('name').equals({first: 'Clem', last: 'Fandango'}).then(result => {
//     console.log(result);
// });

// Get all users with the last name 'Bear'
// query(User).with('name').filterByComposite({last: 'Bear'}).then(result => {
//     console.log(result);
// });

// Get a single user by ID
// query(User).byId('360b99c1-341f-4ad4-a8b9-1f63668f421f', result => {
//     console.log(result);
// }).catch();

// Get a single user by their email
// query(User).with('email').equals('clem@scramblestudios.co.uk').then(result => {
//     console.log(result);
// });

// In TS 3.4 we can rely on (result: User[]), so explicit type of forEach not needed
query(User).then(result => {
    result.forEach((user: User) => {
        if (typeof user.account === 'object') {
            const acc = user.account as unknown as Account;
            console.log(acc);
            console.log(user);
        }
    })
});

// Get all users belonging to Account ID b8c80039-1c35-42cc-8444-68cce76b4e0f
// query(User).with('account').equals('b8c80039-1c35-42cc-8444-68cce76b4e0f').then(result => {
//     console.log(result);
// });

// const u = makeEntity(User)('u1');
// const a = makeEntity(Account)('a2');
// u.account = a;
// u.store();