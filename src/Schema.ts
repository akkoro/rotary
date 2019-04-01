import * as AWS from "aws-sdk";
import * as md5 from "md5";
import {Config} from "./index";
import {DocumentClient} from "aws-sdk/lib/dynamodb/document_client";
import AttributeMap = DocumentClient.AttributeMap;
import {EntityConstructor} from "./Entity";

AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();

class Schema {
    private schemas: {[key: string]: object} = {};

    public async store(entity: EntityConstructor, attr: object, attrName: string): Promise<void> {
        let schema: object = {};
        let schemaString: string = '';
        Object.keys(attr).reverse().forEach(key => {
            // @ts-ignore
            if (typeof attr[key] === 'object') {
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

        await db.put({TableName: Config.tableName, Item: item}).promise();

        this.schemas = {
            ...this.schemas,
            [schemaKey]: schema
        };
    }

    public async load(entity: EntityConstructor, attrName: string): Promise<object> {
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

        const result = await db.query(params).promise();
        const schemaObj = this.fromItem(result.Items[0]);

        this.schemas = {
            ...this.schemas,
            [schemaKey]: schemaObj
        };

        return schemaObj;
    }

    /**
     * Return a schema object for attribute on entity
     * Checks local storage first, then fetches from DynamoDB if not found.
     * @param entity
     * @param attrName
     */
    public async resolve(entity: EntityConstructor, attrName: string): Promise<object> {
        const schemaKey = `${entity.name.toUpperCase()}:${attrName}`;
        return this.schemas[schemaKey] || this.load(entity, attrName);
    }

    public async fetchAll() {
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

        const results = await db.query(params).promise();
        results.Items.forEach(item => {
            const schemaKey = (item['pk'] as string).split('#')[1];
            const schema = this.fromItem(item);
            this.schemas = {
                ...this.schemas,
                [schemaKey]: schema
            };
        });

        console.log(this.schemas);
    }

    /**
     * Return a function which will map composite attribute values to entity[key] based on schema object
     * Suitable for passing to resolve(...).then()
     * @param formattedValues The composite attribute as stored in DynamoDB, ie `#value1#value2`
     * @param entity The entity object to write to
     * @param key The key name in entity of the composite attribute
     * @param resolve Optional resolve function (ie from Promise)
     */
    public getValueMapper(formattedValues: string, entity: object, key: string, resolve?: Function)
        : ((value: object) => void)
    {
        const schemaValues = formattedValues.split('#').slice(1).reverse();

        return function(schema: object) {
            const schemaKeys = Object.keys(schema);
            if (schemaValues.length !== schemaKeys.length) {
                throw new Error('schema mismatch');
            }

            entity[key] = {};
            schemaKeys.forEach((schemaKey, index) => {
                entity[key] = {
                    ...entity[key],
                    [schemaKey]: schemaValues[index]
                }
            });

            resolve ? resolve(entity[key]) : null;
        }
    }

    private fromItem(item: AttributeMap): object {
        const schemaString = item['data'] as string;
        const keys = schemaString.split('#').slice(1).reverse();

        let schemaObj = {};
        keys.forEach(key => {
            schemaObj[key] = 'string';
        });

        return schemaObj;
    }
}

export const SchemaRepository = new Schema();