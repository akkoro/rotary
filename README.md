Rotary
======
*DynamoDB with rules.*  

Rotary is an open-source library for AWS DynamoDB queries. It aims to
implement a set of constraints which allow data to be stored
according to one or more ["best-practice"](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html) strategies.  

It is written in TypeScript, and builds on both OO and FP principles.  
In particular, it is worth noting that Futures are used instead of Promises.
All future-returning APIs can be converted to promises with `.promise()`.

Install with
`yarn add @akkoro/rotary`
----------

# Overview

## Quickstart

```
Config.tableName = 'myDynamoTable';

interface UserAddress {
    city: string;
    country: string;
}

@Entity()
class User {
    @Unique
    email: string;

    @Searchable({composite: true})
    address: UserAddress;

    @Searchable({signed: false})
    type: number;

    @Ref(Account)
    account: Account;

    birthdate: string;
}

@Entity()
class Account {
    type: string;
}

@Entity('TimeSeries')
class Post {
    content: string;
}

// create and store new user entity
const user = makeEntity(User)({id: 'myUser'});
user.email = 'clem.fandango@scramblestudios.co.uk';
user.type = 1;
user.country = {
    city: 'London',
    country: 'UK'
};
user.store().fork(console.error, console.log);

// create and store a new post
const post = makeEntity(Post)({id: 'myUser', timestamp: Date.now()});
post.content = 'this is some hot content';
post.store().fork(console.error, console.log);

// query a user by email
query(User)
    .select('email')
    .equals('clem.fandango@scramblestudios.co.uk')
    .fork(console.error, console.log)
;

// query all users who live in the UK
query(User)
    .select('address')
    .match({country: 'UK'})
    .fork(console.error, console.log)
;
```

## Entities

TODO

## Attributes

TODO

## Storage Strategies

TODO
