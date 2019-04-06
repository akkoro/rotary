import Query from "./Query";
import Condition, {RefAttributeCondition, SearchableAttributeCondition, UniqueAttributeCondition} from "./Condition";

class Key<EntityType> {
    public name: string;
    public query: Query<EntityType>;

    public equals(value: object|string) {
        const condition = this.baseCondition();
        condition.type = 'equals';
        condition.value = value;

        return condition;
    }

    public filterByComposite(value: object) {
        const condition = this.baseCondition();
        condition.type = 'filterByComposite';
        condition.value = value;

        return condition;
    }

    public like(value: object|string) {
        const condition = this.baseCondition();
        condition.type = 'like';
        condition.value = value;

        return condition;
    }

    private baseCondition() {
        let condition;
        if (Reflect.hasMetadata('name:unique', this.query.target, this.name)) {
            condition = new Condition(new UniqueAttributeCondition());
        } else if (Reflect.hasMetadata('name:searchable', this.query.target, this.name)) {
            condition = new Condition(new SearchableAttributeCondition());
        } else if (Reflect.hasMetadata('name:ref', this.query.target, this.name)) {
            condition = new Condition(new RefAttributeCondition());
        }
        condition.key = this;
        condition.query = this.query;

        return condition;
    }
}

export default Key;