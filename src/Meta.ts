import * as AWS from 'aws-sdk';
import * as Future from 'fluture';
import * as md5 from 'md5';
import {Config} from './index';
import {DocumentClient} from 'aws-sdk/lib/dynamodb/document_client';
import AttributeMap = DocumentClient.AttributeMap;
import {EntityConstructor} from './entity';

const db = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});

class Meta {
    private schemas: {[key: string]: object} = {};
    private types: {[key: string]: string} = {};

    public storeSchema (entity: EntityConstructor, attrValue: object, attrName: string) {
        const schema: object = {};
        let schemaString: string = '';
        Object.keys(attrValue).reverse().forEach(key => {
            if (typeof attrValue[key] === 'object') {
                throw new Error('cannot store nested composite attributes');
            }

            schema[key] = typeof attrValue[key];
            schemaString = `${schemaString}#${key}:${typeof attrValue[key]}`;
        });

        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;

        const item = {
            pk: `SCHEMA#${schemaKey}`,
            sk: `META#${entity.name.toUpperCase()}`,
            data: schemaString,
            hash: md5(schemaString)
        };

        this.schemas = {
            ...this.schemas,
            [schemaKey]: schema
        };

        return Future.tryP(() => db.put({TableName: Config.tableName, Item: item}).promise());
    }

    public loadSchema (entity: EntityConstructor, attrName: string) {
        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;
        const params = {
            TableName: Config.tableName,
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': `SCHEMA#${schemaKey}`
            }
        };

        return Future.tryP(() => db.query(params).promise())
            .chain(result => result.Items.length ? Future.of(result.Items[0]) : Future.reject(`schema not found for ${schemaKey}`))
            .map(item => this.schemaFromString(item['data']))
            .map(schemaObj => {
                this.schemas = {
                    ...this.schemas,
                    [schemaKey]: schemaObj
                };

                return schemaObj;
            });
    }

    public storeType (entity: EntityConstructor, attrName: string, type: string) {
        const target = `${entity.name.toUpperCase()}:${attrName}`;
        const item = {
            pk: `TYPE#${target}`,
            sk: `META#${entity.name.toUpperCase()}`,
            data: type,
            hash: md5(type)
        };

        return Future.tryP(() => db.put({TableName: Config.tableName, Item: item}).promise());
    }

    public loadType (entity: EntityConstructor, attrName: string) {
        const target = `${entity.name.toUpperCase()}:${attrName}`;
        const params = {
            TableName: Config.tableName,
            KeyConditionExpression: '#pk = :pk',
            ExpressionAttributeNames: {
                '#pk': 'pk'
            },
            ExpressionAttributeValues: {
                ':pk': `TYPE#${target}`
            }
        };

        return Future.tryP(() => db.query(params).promise())
            .chain(result => result.Items.length ? Future.of(result.Items[0]) : Future.reject(`type not found for ${target}`))
            .map(item => item['data'])
            .map(type => {
                this.types = {
                    ...this.types,
                    [target]: type
                };

                return type;
            });
    }

    /**
     * Return a schema object for attribute on entity
     * Checks local storage first, then fetches from DynamoDB if not found.
     * @param entity
     * @param attrName
     */
    public resolveSchema (entity: EntityConstructor, attrName: string) {
        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;
        // return this.schemas[schemaKey] || this.load(entity, attrName);
        return this.schemas[schemaKey] ? Future.of(this.schemas[schemaKey]) : this.loadSchema(entity, attrName);
    }

    public resolveType (entity: EntityConstructor, attrName: string) {
        const target = `${entity.name.toUpperCase()}:${attrName}`;
        // return this.schemas[schemaKey] || this.load(entity, attrName);
        return this.types[target] ? Future.of(this.types[target]) : this.loadType(entity, attrName);
    }

    public fetchAllForEntity (entity: EntityConstructor) {
        const params = {
            TableName: Config.tableName,
            IndexName: 'sk-data-index',
            KeyConditionExpression: '#sk = :sk',
            ExpressionAttributeNames: {
                '#sk': 'sk'
            },
            ExpressionAttributeValues: {
                ':sk': `META#${entity.name.toUpperCase()}`
            }
        };

        return Future.tryP(() => db.query(params).promise())
            .map(result => result.Items)
            .map(items => {
                items.forEach(item => {
                    const pk = item['pk'] as string;
                    const [metaType, target] = pk.split('#');

                    switch (metaType) {
                        case 'SCHEMA':
                            const schema = this.schemaFromString(item['data']);
                            this.schemas = {
                                ...this.schemas,
                                [target]: schema
                            };
                            break;

                        case 'TYPE':
                            this.types = {
                                ...this.types,
                                [target]: item['data']
                            };
                            break;

                        default:
                            throw new Error(`unrecognized metadata type ${metaType}`);
                    }
                });
            })
        ;
    }

    /**
     * Return a function which will map composite attribute values to entity[key] based on schema object
     * Suitable for passing to resolve(...).then()
     * @param formattedValues The composite attribute as stored in DynamoDB, ie `#value1#value2`
     */
    public getSchemaValueMapper (formattedValues: string)
        : ((value: object) => void) {
        const attributeValues = formattedValues.split('#').slice(1).reverse();

        return function (schema: object) {
            const schemaKeys = Object.keys(schema);
            if (attributeValues.length !== schemaKeys.length) {
                throw new Error('schema mismatch');
            }

            let keyValue = {};
            schemaKeys.forEach((schemaKey, index) => {
                const type = schema[schemaKey];
                const value = attributeValues[index];
                keyValue = {
                    ...keyValue,
                    [schemaKey]: type === 'number' ? Number(value) : value
                };
            });

            return keyValue;
        };
    }

    private schemaFromString (s: string): object {
        const keys = s.split('#').slice(1).reverse();

        const schemaObj = {};
        keys.forEach(key => {
            const [name, type] = key.split(':');
            schemaObj[name] = type;
        });

        return schemaObj;
    }
}

export const MetaRepository = new Meta();
