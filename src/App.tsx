import { useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { db } from './db/db';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { localDate } from './domain/dates';
import { AddFoodScreen } from './ui/screens/AddFoodScreen';
import { AmountScreen } from './ui/screens/AmountScreen';
import { FoodEditorScreen } from './ui/screens/FoodEditorScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { LogFoodSheet } from './ui/screens/LogFoodSheet';
import { MealScreen } from './ui/screens/MealScreen';
import { QuickAddScreen } from './ui/screens/QuickAddScreen';
import { RecipeEditorScreen } from './ui/screens/RecipeEditorScreen';
import { RecipePortionScreen } from './ui/screens/RecipePortionScreen';
import { RecipesScreen } from './ui/screens/RecipesScreen';
import { ScanScreen } from './ui/screens/ScanScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { TemplatePicker } from './ui/screens/TemplatePicker';
import { TodayScreen } from './ui/screens/TodayScreen';
import { WeightScreen } from './ui/screens/WeightScreen';
import { WorkoutScreen } from './ui/screens/WorkoutScreen';
import { ExercisePickerScreen } from './ui/screens/ExercisePickerScreen';
import { RecapScreen } from './ui/screens/RecapScreen';
import { WorkoutsScreen } from './ui/screens/WorkoutsScreen';
import { RoutinesScreen } from './ui/screens/RoutinesScreen';
import { RoutineEditorScreen } from './ui/screens/RoutineEditorScreen';
import { ExerciseEditorScreen } from './ui/screens/ExerciseEditorScreen';
import { ExerciseHistoryScreen } from './ui/screens/ExerciseHistoryScreen';

function ToHome() {
  return <Navigate to="/" replace />;
}

/** One boundary per address: moving to another screen clears a failure. */
function Screens() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/day/:date" element={<TodayScreen />} />
        <Route path="/day/:date/log" element={<LogFoodSheet />} />
        <Route path="/day/:date/templates" element={<TemplatePicker />} />
        <Route path="/meal/:mealId" element={<MealScreen />} />
        <Route path="/meal/:mealId/add" element={<AddFoodScreen />} />
        <Route path="/meal/:mealId/add/:foodRef" element={<AmountScreen />} />
        <Route path="/meal/:mealId/recipe/:recipeId" element={<RecipePortionScreen />} />
        <Route path="/meal/:mealId/quick" element={<QuickAddScreen />} />
        <Route path="/meal/:mealId/scan" element={<ScanScreen />} />
        <Route path="/foods/:id" element={<FoodEditorScreen />} />
        <Route path="/recipes" element={<RecipesScreen />} />
        <Route path="/recipes/:id" element={<RecipeEditorScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/weight" element={<WeightScreen />} />
        <Route path="/workout/:id" element={<WorkoutScreen />} />
        <Route path="/workout/:id/add" element={<ExercisePickerScreen />} />
        <Route path="/workout/:id/swap/:entryId" element={<ExercisePickerScreen />} />
        <Route path="/workout/:id/recap" element={<RecapScreen />} />
        <Route path="/workouts" element={<WorkoutsScreen />} />
        <Route path="/workouts/routines" element={<RoutinesScreen />} />
        <Route path="/routines/:id" element={<RoutineEditorScreen />} />
        <Route path="/exercises/:id/history" element={<ExerciseHistoryScreen />} />
        <Route path="/exercises/:id" element={<ExerciseEditorScreen />} />
        <Route path="*" element={<ToHome />} />
      </Routes>
    </ErrorBoundary>
  );
}

/**
 * iOS keeps a Home Screen app suspended for days. When it comes back on a new date and the
 * screen belonged to the old "today" (that day, or one of its meals), go to Home (always today),
 * so food is not logged on yesterday. Screens of earlier days are left where they are.
 */
function NewDayWatcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const seen = useRef(localDate(new Date()));

  useEffect(() => {
    const check = async () => {
      if (document.visibilityState === 'hidden') {
        seen.current = localDate(new Date());
        return;
      }
      const before = seen.current;
      const now = localDate(new Date());
      seen.current = now;
      if (before === now) return;
      const current = path.current;
      let screenDate = /^\/day\/(\d{4}-\d{2}-\d{2})/.exec(current)?.[1];
      const mealId = /^\/meal\/([^/]+)/.exec(current)?.[1];
      if (!screenDate && mealId) screenDate = (await db.meals.get(mealId))?.date;
      if (screenDate === before && path.current === current) navigate('/', { replace: true });
    };
    const onChange = () => void check();
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pageshow', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pageshow', onChange);
    };
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <NewDayWatcher />
      <Screens />
    </HashRouter>
  );
}
