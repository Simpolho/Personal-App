/** Only a workout screen is a valid place to return to; anything else falls back to the exercise list. */
const fromWorkout = (from: string | null): string | null => (from?.startsWith('/workout/') ? from : null);
const carry = (path: string, from: string | null) => {
  const f = fromWorkout(from);
  return f ? `${path}?from=${encodeURIComponent(f)}` : path;
};

/** Where Back on an exercise's history goes: the workout it was opened from, or the exercise list. */
export const historyBack = (from: string | null): string => fromWorkout(from) ?? '/workouts/routines';
export const historyPath = (exerciseId: string, from: string | null): string => carry(`/exercises/${exerciseId}/history`, from);
export const editPath = (exerciseId: string, from: string | null): string => carry(`/exercises/${exerciseId}`, from);
