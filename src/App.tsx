import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { localDate } from './domain/dates';
import { AddFoodScreen } from './ui/screens/AddFoodScreen';
import { AmountScreen } from './ui/screens/AmountScreen';
import { FoodEditorScreen } from './ui/screens/FoodEditorScreen';
import { LogFoodSheet } from './ui/screens/LogFoodSheet';
import { MealScreen } from './ui/screens/MealScreen';
import { QuickAddScreen } from './ui/screens/QuickAddScreen';
import { RecipeEditorScreen } from './ui/screens/RecipeEditorScreen';
import { RecipePortionScreen } from './ui/screens/RecipePortionScreen';
import { RecipesScreen } from './ui/screens/RecipesScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { TemplatePicker } from './ui/screens/TemplatePicker';
import { TodayScreen } from './ui/screens/TodayScreen';

function ToToday() {
  return <Navigate to={`/day/${localDate(new Date())}`} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ToToday />} />
        <Route path="/day/:date" element={<TodayScreen />} />
        <Route path="/day/:date/log" element={<LogFoodSheet />} />
        <Route path="/day/:date/templates" element={<TemplatePicker />} />
        <Route path="/meal/:mealId" element={<MealScreen />} />
        <Route path="/meal/:mealId/add" element={<AddFoodScreen />} />
        <Route path="/meal/:mealId/add/:foodRef" element={<AmountScreen />} />
        <Route path="/meal/:mealId/recipe/:recipeId" element={<RecipePortionScreen />} />
        <Route path="/meal/:mealId/quick" element={<QuickAddScreen />} />
        <Route path="/foods/:id" element={<FoodEditorScreen />} />
        <Route path="/recipes" element={<RecipesScreen />} />
        <Route path="/recipes/:id" element={<RecipeEditorScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<ToToday />} />
      </Routes>
    </HashRouter>
  );
}
