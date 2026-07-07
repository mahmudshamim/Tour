// Static trip-planning visuals for the Map & Itinerary screens.
// (Expense/people data is dynamic — see store.tsx.)

export const routeStops = [
  { id: "1", name: "আগুন পাহাড়", time: "10:00 AM", meta: "2h duration", icon: "hike" as const },
  { id: "2", name: "মালনীছড়া চা বাগান", time: "12:30 PM", meta: "1h stop", icon: "cafe" as const },
  { id: "3", name: "রাতারগুল", time: "2:00 PM", meta: "45m stop", icon: "view" as const },
];

// Terrain photos (Unsplash). Fallback gradients handle offline.
export const IMG = {
  map: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&q=80&auto=format&fit=crop",
  trek: "https://images.unsplash.com/photo-1674498260932-6f7d8eed6d9f?w=800&q=80&auto=format&fit=crop",
};
