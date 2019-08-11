import {FutureInstance} from 'fluture';
import * as Future from 'fluture';
import {IEntity} from '../../entity';
import {Config} from '../../index';
import {SchemaRepository} from '../../Schema';
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

    public range (args: {start?: any, end?: any}): any {
        const entity = this.strategy.target;
        let {start, end} = args;

        if (typeof start === 'number') {
            start = encode(start, maxNumberPadding);
        }

        if (typeof end === 'number') {
            end = encode(end, maxNumberPadding);
        }

        let op;
        if (start && end) {
            op = '#data between :t1 and :t2';
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

        if (typeof attr === 'object' && isComposite) {
            let composite: string = '';
            Object.keys(attr).reverse().forEach(k => {
                if (typeof attr[k] === 'object') {
                    throw new Error('cannot store nested composite attributes');
                }

                composite = `${composite}#${attr[k]}`;
            });

            if (Config.syncSchemaOnStore) {
                SchemaRepository.store(this.strategy.ctor, attr, key).fork(console.error, console.log);
            }

            return composite;
        }

        if (typeof attr === 'number') {
            return encode(attr, maxNumberPadding);
        }

        return attr;
    }

    public loadValue (item: any, target: E, key: string): FutureInstance<any, any> {
        const isComposite = Reflect.getMetadata('flag:composite', target, key);

        if (typeof item === 'string') {
            const asStr = (item as string).replace(/\$/g, '');

            if (asStr[0] === '-' || asStr[0] === '+') {
                return Future.of(decode(asStr));
            }

            if (!((asStr as string)[0] === '#' && isComposite)) {
                return Future.of(asStr);
            }

            if ((asStr as string)[0] === '#' && isComposite) {
                return SchemaRepository.resolve(this.strategy.ctor, key)
                    .map(SchemaRepository.getValueMapper(asStr))
                ;
            }
        }

        if (typeof item[key] === 'string') {
            const asStr = (item[key] as string).replace(/\$/g, '');

            if (asStr[0] === '#' && isComposite) {
                return SchemaRepository.resolve(this.strategy.ctor, key)
                    .map(SchemaRepository.getValueMapper(asStr))
                ;
            }

            if (asStr[0] === '-' || asStr[0] === '+') {
                return Future.of(decode(asStr));
            }
        }

        return Future.of(item[key]);
    }

}

AttributeTypes[AttributeTypeName] = SearchableAttribute;

function encodePositive (n: number, s?: string) {
    let str = '';
    if (n > 0) { str = `${s || str}+`; }
    if (n.toString().length > 1) { str = encodePositive(n.toString().length, str); }
    return `${str}${n.toString()}`;
}

function encodeNegative (n: number, s?: string) {
    let str = '';
    if (n > 0) { str = `${s || str}-`; }
    if (n.toString().length > 1) { str = encodeNegative(n.toString().length, str); }
    str = `${str}${n.toString()}`;

    let tmp = '';
    for (const c of str) {
        if (c === '-') { tmp = `${tmp}${c}`; } else {
            tmp = `${tmp}${(9 - parseInt(c, 10)).toString()}`;
        }
    }

    return tmp;
}

function encode (n: number, padTo?: number) {
    if (n === 0) { return '0'; }
    let encoded = n < 0 ? encodeNegative(Math.abs(n)) : encodePositive(n);
    if (padTo) {
        while (encoded.length !== padTo) {
           encoded = `$${encoded}`;
        }
    }

    return encoded;
}

function invert (s: string) {
    let tmp = '';
    for (const c of s) {
        tmp = `${tmp}${(9 - parseInt(c, 10)).toString()}`;
    }
    return tmp;
}

function decode (s: string) {
    if (s.charAt(0) === '0') {
        return 0;
    }

    const isPositive = s.charAt(0) === '+';

    const ret = (slice: string) => {
        if (isPositive) {
            return parseInt(slice, 10);
        } else {
            const converted = invert(slice);
            return -parseInt(converted, 10);
        }
    };

    let symbol;
    if (isPositive) { symbol = '+'; } else { symbol = '-'; }

    let sequenceLength = 0;
    let nextLength = 0;

    for (const c of s.slice(1)) {
        if (c === symbol) { sequenceLength++; }
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
            if (isPositive) {
                nextLength = parseInt(p, 10);
            } else {
                nextLength = parseInt(invert(p), 10);
            }
        } else {
            const p = s.slice(i, i + nextLength);
            if (isPositive) {
                nextLength = parseInt(p, 10);
            } else {
                nextLength = parseInt(invert(p), 10);
            }
        }
    }
    base += ll;

    return ret(s.slice(base, base + nextLength));
}
