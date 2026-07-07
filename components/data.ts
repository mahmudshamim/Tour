// Static trip-planning visuals for the Map & Itinerary screens.
// (Expense/people data is dynamic — see store.tsx.)

export const routeStops = [
  { id: "1", name: "Tea Garden Walk", time: "10:00 AM", meta: "2h duration", icon: "hike" as const },
  { id: "2", name: "Seven Color Tea", time: "12:30 PM", meta: "1h stop", icon: "cafe" as const },
  { id: "3", name: "Ratargul Swamp Forest", time: "2:00 PM", meta: "45m stop", icon: "view" as const },
];

// Terrain photos (Unsplash). Fallback gradients handle offline.
export const IMG = {
  map: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&q=80&auto=format&fit=crop",
  trek: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80&auto=format&fit=crop",
};
