import { useParams } from 'react-router-dom';
import { Screen } from '../components/ui';
import { input } from '../styles';

export function AddFoodScreen() {
  const { mealId = '' } = useParams();
  return (
    <Screen title="Add food" back={`/meal/${mealId}`}>
      <input type="search" className={input} placeholder="Search foods" aria-label="Search foods" />
    </Screen>
  );
}
