import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Config, RangeArgs} from '../../index';
import {MetaRepository} from '../../Meta';
import {Attribute, AttributeTypes, IAttribute} from '../Attribute';
import {IStorageStrategy} from '../StorageStrategy';

const AttributeTypeName: string = 'Searchable';
const CompatibleStrategies: string[] = ['Relational'];

const maxInt = 281474976710654;
const maxNumberPadding = encode(maxInt).length;

export function Searchable (args?: {composite?: boolean, signed?: boolean}) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('attr:type', AttributeTypeName, target, key);
        if (args) {
            Reflect.defineMetadata('flag:composite', args.composite, target, key);
            Reflect.defineMetadata('flag:signed', args.signed, target, key);
        }
    };
}

export class SearchableAttribute <E extends IEntity, S extends IStorageStrategy<E, IAttribute<E, S>>>
    extends Attribute<E, S> implements IAttribute<E, S> {

    public readonly indexName: string = 'sk-data-index';
    public readonly typeName: string = AttributeTypeName;
    public compatibleStrategies = CompatibleStrategies;

    public equals (value: any) {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: '#sk = :sk and #data = :data',
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':data': this.storeValue(this.strategy.target, this.name, value),
            },
        };
    }

    public match (value: any): any {
        const entity = this.strategy.target;

        return {
            KeyConditionExpression: `#sk = :sk and begins_with(#data,:data)`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':data': this.storeValue(this.strategy.target, this.name, value),
            }
        };
    }

    public range (args: RangeArgs): any {
        const entity = this.strategy.target;
        let {start, end} = args;

        const negStart = start < 0;

        if (typeof start === 'number') {
            start = start >= 0 ? encode(start, maxNumberPadding) : encode(Math.abs(start) + maxInt);
        }

        if (typeof end === 'number') {
            end = end >= 0 ? encode(end, maxNumberPadding) : encode(Math.abs(end) + maxInt);
        }

        let op;
        if (start && end) {
            op = negStart ? '#data between :t2 and :t1' : '#data between :t1 and :t2';
        } else if (start && !end) {
            op = '#data >= :t1';
        } else if (!start && end) {
            op = '#data <= :t2';
        }

        return {
            KeyConditionExpression: `#sk = :sk and ${op}`,
            ExpressionAttributeNames: {
                '#sk': 'sk',
                '#data': 'data',
            },
            ExpressionAttributeValues: {
                ':sk': `${entity.tableName.toUpperCase()}:${this.name}`,
                ':t1': start,
                ':t2': end
            },
            // ScanIndexForward: true
        };
    }

    public loadKeyValue (item: any): any {
        const entity = this.strategy.target;
        return this.loadValue(item.data, entity, this.name);
    }

    public storeItem () {
        const entity = this.strategy.target;

        let item = {
            pk: `${entity.tableName.toUpperCase()}#${entity.id}`,
            sk: `${entity.tableName.toUpperCase()}:${this.name}`,
            data: this.storeValue(entity, this.name)
        };

        // TODO: get ID attribute names from strategy
        Object.keys(entity).filter(key => key !== 'id' && key !== this.name).forEach(key => {
            item = this.storeAttribute(item, entity, key);
        });

        return item;
    }

    public storeValue (entity: E, key: string, value?: any): string {
        const attr = value || entity[key];
        const isComposite = Reflect.getMetadata('flag:composite', entity, key);
        const isSigned = Reflect.getMetadata('flag:signed', entity, key);
        const syncMetadata = Config.syncSchemaOnStore && !value;

        if (typeof attr === 'object' && isComposite) {
            let composite: string = '';
            Object.keys(attr).reverse().forEach(k => {
                if (typeof attr[k] === 'object') {
                    throw new Error('cannot store nested composite attributes');
                }

                composite = `${composite}#${attr[k]}`;
            });

            if (syncMetadata) {
                MetaRepository.storeType(this.strategy.ctor, key, 'composite')
                    .chain(() => MetaRepository.storeSchema(this.strategy.ctor, attr, key))
                    .fork(console.error, console.log);
            }

            return composite;
        }

        if (typeof attr === 'number') {
            if (syncMetadata) {
                MetaRepository.storeType(this.strategy.ctor, key, 'number').fork(console.error, console.log);
            }

            if (isSigned && attr < 0) {
                return encode(Math.abs(attr) + maxInt, maxNumberPadding);
            }

            return encode(attr, maxNumberPadding);
        }

        if (syncMetadata) {
            MetaRepository.storeType(this.strategy.ctor, key, typeof attr).fork(console.error, console.log);
        }

        return attr;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        const isSigned = Reflect.getMetadata('flag:signed', target, key);

        const value = (typeof item === 'string') ? item :
            (typeof item[key] === 'string') ? item[key] : undefined
        ;

        if (value) {
            return MetaRepository.resolveType(this.strategy.ctor, key)
                .chain((type: string) => {
                    switch (type) {
                        case 'number':
                            const asStr = (value as string).replace(/\$/g, '');
                            return Future.of(decode(asStr, isSigned)) as FutureInstance<any, any>;

                        case 'composite':
                            return MetaRepository.resolveSchema(this.strategy.ctor, key)
                                .map(MetaRepository.getSchemaValueMapper(value)) as FutureInstance<any, any>
                            ;

                        default:
                            return Future.of(value) as FutureInstance<any, any>;
                    }
                })
            ;
        }

        return Future.of(item[key]);
    }

}

AttributeTypes[AttributeTypeName] = SearchableAttribute;

function encodeImpl (n: number, s?: string) {
    let str = '';
    if (n >= 0) { str = `${s || str}+`; }
    if (n.toString().length > 1) { str = encodeImpl(n.toString().length, str); }
    return `${str}${n.toString()}`;
}

function encode (n: number, padTo?: number) {
    let encoded = encodeImpl(n);
    if (padTo) {
        while (encoded.length !== padTo) {
           encoded = `$${encoded}`;
        }
    }

    return encoded;
}

function decode (s: string, isSigned?: boolean) {
    const ret = (slice: string) => {
        let n = parseInt(slice, 10);
        if (isSigned && n > (maxInt / 2)) {
            n = -(n - maxInt);
        }

        return n;
    };

    let sequenceLength = 0;
    let nextLength = 0;

    for (const c of s.slice(1)) {
        if (c === '+') { sequenceLength++; }
    }

    if (!sequenceLength) {
        return ret(s.slice(1));
    }

    let ll = 0;
    let base = 1 + sequenceLength;
    for (let i = base; i < sequenceLength + base; i++) {
        ll += nextLength;
        if (i === base) {
            ll += 1;

            const p = s[i];
            nextLength = parseInt(p, 10);
        } else {
            const p = s.slice(i, i + nextLength);
            nextLength = parseInt(p, 10);
        }
    }
    base += ll;

    return ret(s.slice(base, base + nextLength));
}
