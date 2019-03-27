import "reflect-metadata";

import {query} from "./Query";
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

query(User).with('name').equals({first: 'Clem', last: 'Fandango'}).then(result => {
    console.log(result);
});

// query(User).with('name').filterByComposite({last: 'Bear'}).then(result => {
//     console.log(result);
// });

query(User).byId('360b99c1-341f-4ad4-a8b9-1f63668f421f', result => {
    console.log(result);
}).catch();

// query(User).with('email').equals('clem@scramblestudios.co.uk').then(result => {
//     console.log(result);
// });

// query(User).then(result => {
//     console.log(result);
// });