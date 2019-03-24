import "reflect-metadata";

import {find, Query} from "./Query";
import {Attribute, Entity, Ref, Searchable, Unique} from "./Entity";

@Entity('User')
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

    @Ref
    account: Ref;
}

// find(User).with('name').filterBy({last: 'Bear'}).then(result => {
//     console.log(result);
// });
//
// find(User).with('email').equals('clem@scramblestudios.co.uk').then(result => {
//     console.log(result);
// });

find(User).then(result => {
    console.log(result);
});