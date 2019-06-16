export function isAttributeComposite(target: any, key: string) {
    if (Reflect.hasMetadata('ref:target', target, key)) {
        return false;
    }

    return (typeof target[key] === 'object');
}