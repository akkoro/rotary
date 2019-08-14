Rotary
======
*DynamoDB with rules.*  

Rotary is an open-source library for AWS DynamoDB queries. It aims to
implement a set of constraints which allow data to be stored
according to one or more ["best-practice"](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html) strategies.  
Currently the project ships with strategies for relational data and time-series data.

It is written in TypeScript, and builds on both OO and FP principles.  
In particular, it is worth noting that Futures are used instead of Promises.
All future-returning APIs can be converted to promises by calling `.promise()` instead of `.fork()`.

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

Entities follow the [Active Record](https://en.wikipedia.org/wiki/Active_record_pattern) pattern,
and provide the means for modeling data. Entities optionally specify a [Storage Strategy](#storage-strategies) such as
`Relational` or `TimeSeries` (default is Relational), which determines how the entity is stored in a DynamoDB table.  
Entity attributes are specified as class fields, and may optionally specify _one_ [Attribute](#attributes) decorator.

## Attributes

Attributes provide additional query and/or storage functionality to an entity field. They are similar to how a primary key 
or foreign key constraint might be specified in a traditional RDBMS ORM such as TypeORM.  

Some attribute types insert an additional row in DynamoDB when the entity is stored to support query operations on that attribute. 
Care should be taken to balance desired functionality with the extra data & redundancy that is required to support it.  

Some attributes can only be used with a specific [Storage Strategy](#storage-strategies).

### Built-In Attributes

Name       | Supported Strategies   | Supported Operations | Details
-----------|------------------------|----------------------|--------
Unique     | Relational             | equals               | Specify for attributes which function as a unique identifier. Adds an additional row.
Searchable | Relational             | equals, match, range | Specify for attributes non-unique attributes requiring query, or for data that can be queried with partial info. Adds an additoinal row.
Ref        | Relational, TimeSeries | N/A                  | Specify that the attribute contains another entity; the referenced entity will be loaded by ID.

All entities also provide an `id` attribute which can be queried; the supported operations depend on the storage strategy.

TODO: details on Searchable attribute options `composite` and `signed`

## Storage Strategies

Storage Strategies implement higher-level details about [Entity](#entities) storage. For example, entities stored with the `Relational` strategy 
are packed into a single DynamoDB table, while `TimeSeries` entities require their own table.

### Built-In Strategies

Name       | Requires LSI | ID Operations | Details
-----------|--------------|---------------|----------
Relational | Yes          | equals        | Emulate a traditional RDBMS
TimeSeries | No           | equals, range | Store multiple items with the same `id` at many `timestamp`s.

# DynamoDB Configuration

## Relational

Create a table with any name (be sure to specify this name in `Config.tableName`). This table must have:  
 * a Primary Key named `pk` of type `string`
 * a Sort Key named `sk` of type `string`
 * a local secondary index named `sk-data-index` with
   * a Primary Key named `sk`
   * a Sort Key named `data`
 
## TimeSeries
Create a table with any base name (specified in `Config.tableName`), with a suffix of `-ENTITYNAME`.  
For example, if `tableName` is `rotary` and our entity is called `Content`, the TimeSeries table must be named `rotary-CONTENT`.  
This table must have:  
 * a Primary Key named `pk` of type `string`
 * a Sort Key named `sk` of type `number`
