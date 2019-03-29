import "reflect-metadata";

import {query} from "./Query";
import {Attribute, Entity, Ref, Searchable, Unique} from "./Entity";

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
query(User).with('name').equals({first: 'Clem', last: 'Fandango'}).then(result => {
    console.log(result);
});

// Get all users with the last name 'Bear'
query(User).with('name').filterByComposite({last: 'Bear'}).then(result => {
    console.log(result);
});

// Get a single user by ID
query(User).byId('360b99c1-341f-4ad4-a8b9-1f63668f421f', result => {
    console.log(result);
}).catch();

// Get a single user by their email
query(User).with('email').equals('clem@scramblestudios.co.uk').then(result => {
    console.log(result);
});

// Get all users
query(User).then(result => {
    console.log(result);
});

// Get all users belonging to Account ID b8c80039-1c35-42cc-8444-68cce76b4e0f
query(User).with('account').equals('b8c80039-1c35-42cc-8444-68cce76b4e0f').then(result => {
    console.log(result);
});