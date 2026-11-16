import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { localDate } from './domain/dates';
import { AddFoodScreen } from './ui/screens/AddFoodScreen';
import { LogFoodSheet } from './ui/screens/LogFoodSheet';
import { MealScreen } from './ui/screens/MealScreen';
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
        <Route path="*" element={<ToToday />} />
      </Routes>
    </HashRouter>
  );
}
