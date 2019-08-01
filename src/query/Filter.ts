import {ICondition} from './Condition';
import {Executor} from './index';

class Filter<EntityType, AttributeType extends ICondition<EntityType>> {
    public name: string;
    public executor: Executor<EntityType>;
    public expression: string = '';
    public expressionNames: {[key: string]: string};
    public expressionValues: {[key: string]: string};

    public and (attr: string) {
        this.name = attr;
        this.expression = `${this.expression} and`;
        return this;
    }

    public equalTo (value: string) {
        this.expressionNames = {
            ...this.expressionNames,
            [`#${this.name}`]: this.name
        };

        this.expressionValues = {
            ...this.expressionValues,
            [`:${this.name}`]: value
        };

        this.expression = `${this.expression} #${this.name} = :${this.name}`;
        return this;
    }

    public exec () {
        return this.executor.exec({
            expressionNames: this.expressionNames,
            expressionValues: this.expressionValues,
            expression: this.expression
        });
    }
}

export default Filter;
