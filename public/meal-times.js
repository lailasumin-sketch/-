export const mealWindows = [{key:'lunch',start:690,end:840},{key:'dinner',start:1020,end:1200}];
export function mealPeriodAt(minute){return mealWindows.find(window=>minute>=window.start&&minute<=window.end)?.key||null;}
