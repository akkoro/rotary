import * as AWS from 'aws-sdk';
import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import * as md5 from 'md5';
import {Config} from './index';
import {DocumentClient} from 'aws-sdk/lib/dynamodb/document_client';
import AttributeMap = DocumentClient.AttributeMap;
import {EntityConstructor} from './entity';

const db = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});

class Schema {
    private schemas: {[key: string]: object} = {};

    public store (entity: EntityConstructor, attrValue: object, attrName: string) {
        const schema: object = {};
        let schemaString: string = '';
        Object.keys(attrValue).reverse().forEach(key => {
            // @ts-ignore
            if (typeof attrValue[key] === 'object') {
                throw new Error('cannot store nested composite attributes');
            }

            schema[key] = 'string';
            schemaString = `${schemaString}#${key}`;
        });

        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;

        const item = {
            pk: `$SCHEMA#${schemaKey}`,
            sk: 'SCHEMA',
            data: schemaString,
            hash: md5(schemaString)
        };

        this.schemas = {
            ...this.schemas,
            [schemaKey]: schema
        };

        return Future.tryP(() => db.put({TableName: Config.tableName, Item: item}).promise());
    }

    public load (entity: EntityConstructor, attrName: string) {
        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;
        const params = {
            TableName: Config.tableName,
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': `$SCHEMA#${schemaKey}`
            }
        };

        return Future.tryP(() => db.query(params).promise())
            .chain(result => result.Items.length ? Future.of(result.Items[0]) : Future.reject(`schema not found for ${schemaKey}`))
            .map(item => this.fromItem(item))
            .map(schemaObj => {
                this.schemas = {
                    ...this.schemas,
                    [schemaKey]: schemaObj
                };

                return schemaObj;
            });
    }

    /**
     * Return a schema object for attribute on entity
     * Checks local storage first, then fetches from DynamoDB if not found.
     * @param entity
     * @param attrName
     */
    public resolve (entity: EntityConstructor, attrName: string) {
        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;
        // return this.schemas[schemaKey] || this.load(entity, attrName);
        return this.schemas[schemaKey] ? Future.of(this.schemas[schemaKey]) : this.load(entity, attrName);
    }

    public fetchAll () {
        const params = {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':sk': 'SCHEMA'
            }
        };

        // const results = await db.query(params).promise();
        // results.Items.forEach(item => {
        //     const schemaKey = (item['pk'] as string).split('#')[1];
        //     const schema = this.fromItem(item);
        //     this.schemas = {
        //         ...this.schemas,
        //         [schemaKey]: schema
        //     };
        // });
        //
        // console.log(this.schemas);
        return Future.tryP(() => db.query(params).promise())
            .map(result => result.Items)
            .map(items => {
                items.forEach(item => {
                    const schemaKey = (item['pk'] as string).split('#')[1];
                    const schema = this.fromItem(item);
                    this.schemas = {
                        ...this.schemas,
                        [schemaKey]: schema
                    };
                });
            });
    }

    /**
     * Return a function which will map composite attribute values to entity[key] based on schema object
     * Suitable for passing to resolve(...).then()
     * @param formattedValues The composite attribute as stored in DynamoDB, ie `#value1#value2`
     */
    public getValueMapper (formattedValues: string)
        : ((value: object) => void) {
        const schemaValues = formattedValues.split('#').slice(1).reverse();

        return function (schema: object) {
            const schemaKeys = Object.keys(schema);
            if (schemaValues.length !== schemaKeys.length) {
                throw new Error('schema mismatch');
            }

            let keyValue = {};
            schemaKeys.forEach((schemaKey, index) => {
                keyValue = {
                    ...keyValue,
                    [schemaKey]: schemaValues[index]
                };
            });

            return keyValue;
        };
    }

    private fromItem (item: AttributeMap): object {
        const schemaString = item['data'] as string;
        const keys = schemaString.split('#').slice(1).reverse();

        const schemaObj = {};
        keys.forEach(key => {
            schemaObj[key] = 'string';
        });

        return schemaObj;
    }
}

export const SchemaRepository = new Schema();
