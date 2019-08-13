import 'reflect-metadata';
import './query/strategies/RelationalStorageStrategy';
import './query/strategies/TimeSeriesStorageStrategy';
import './query/attributes/UniqueAttribute';
import * as AWS from 'aws-sdk';

export class Config {
    public static tableName: string;
    public static storeDeepReferences: boolean = false;
    public static syncSchemaOnStore: boolean = true;
    public static enableDebugLogging: boolean = false;
    public static db = new AWS.DynamoDB.DocumentClient({region: 'us-east-1'});
}

export * from './entity';
export * from './query';
export * from './Meta';
