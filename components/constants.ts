import {
  ShoppingBag,
  Utensils,
  Ticket,
  Bed,
  Car,
  Receipt,
  Bus,
  TrainFront,
  Ship,
  Sailboat,
  CarTaxiFront,
  Bike,
  CarFront,
  Plane,
  Fuel,
  SquareParking,
  BedDouble,
  Tent,
  Coffee,
  CookingPot,
  UtensilsCrossed,
  Fish,
  Drumstick,
  Beef,
  Pizza,
  Sandwich,
  IceCreamCone,
  GlassWater,
  Cookie,
  Apple,
  Signpost,
  Pill,
  Gift,
  Smartphone,
  Camera,
  HandCoins,
  Shirt,
  type LucideIcon,
} from "lucide-react";

export type CategoryId =
  | "gear"
  | "food"
  | "fees"
  | "stay"
  | "travel"
  | "other";

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "gear", label: "Gear", Icon: ShoppingBag },
  { id: "food", label: "Food", Icon: Utensils },
  { id: "fees", label: "Fees", Icon: Ticket },
  { id: "stay", label: "Stay", Icon: Bed },
  { id: "travel", label: "Travel", Icon: Car },
  { id: "other", label: "Other", Icon: Receipt },
];

export const catIcon = (id: CategoryId): LucideIcon =>
  CATEGORIES.find((c) => c.id === id)?.Icon ?? Receipt;

export const catLabel = (id: CategoryId): string =>
  CATEGORIES.find((c) => c.id === id)?.label ?? "Other";

/* ---- relevant icons from what an expense is called ---- */

/** Latin words match whole (plurals spelled out); Bangla ones at a word
 *  start, since Bangla words take suffixes ("বাসে", "হোটেলের"). */
const rule = (en: string, bn: string, Icon: LucideIcon, cat: CategoryId) => ({
  re: new RegExp(`\\b(?:${en})\\b|(?:^|[^\\u0980-\\u09FF])(?:${bn})`, "i"),
  Icon,
  cat,
});

/** Most specific first: "Bus ticket" is a bus, "hotel lunch" is lunch… */
const RULES = [
  rule("bus|buses|coach|green ?line|hanif|shyamoli|soudia", "বাস(?!া)", Bus, "travel"),
  rule("train|trains|rail|intercity|parabat|kalni|jayantika|upaban|turna|subarna", "ট্রেন|রেল|পারাবত|কালনী|জয়ন্তিকা|উপবন", TrainFront, "travel"),
  rule("launch|ship|ferry|steamer|cruise|keari|karnaphuli", "লঞ্চ|জাহাজ|ফেরি|শিপ", Ship, "travel"),
  rule("boat|boats|nouka|nauka|trawler|speed ?boat|kayak|engine ?boat", "নৌকা|ট্রলার|বোট|স্পিডবোট", Sailboat, "travel"),
  rule("flight|flights|plane|air ?ticket|airport|biman|novoair|us-?bangla", "বিমান|ফ্লাইট|এয়ারপোর্ট", Plane, "travel"),
  rule("cng|auto|taxi|tomtom|easy ?bike|leguna|tempo|human ?haler", "সিএনজি|অটো|ট্যাক্সি|লেগুনা|টমটম|ইজিবাইক", CarTaxiFront, "travel"),
  rule("rickshaw|riksha|rikshaw|van|bike|bikes|pathao|cycle|motor ?cycle", "রিকশা|বাইক|ভ্যান|সাইকেল", Bike, "travel"),
  rule("car|cars|jeep|jeeps|chander ?gari|chader ?gari|microbus|micro|uber|hiace|noah|gari|pickup|transport", "গাড়ি|জিপ|চান্দের|চাঁদের|মাইক্রো|উবার|পরিবহন", CarFront, "travel"),
  rule("fuel|petrol|octane|diesel|gas", "তেল|পেট্রোল|অকটেন|ডিজেল", Fuel, "travel"),
  rule("parking|toll", "পার্কিং|টোল", SquareParking, "fees"),
  rule("tea|cha|chai|coffee|cafe|latte|cappuccino|7 ?colou?r|seven ?colou?r", "চা(?![\\u0980-\\u09FF])|কফি|সাত রঙ", Coffee, "food"),
  rule("kacc?h?i|biriyani|biryani|tehari|polao|pulao|khichuri|khichdi|bhat|rice", "কাচ্চি|বিরিয়ানি|বিরিয়ানি|তেহারি|পোলাও|খিচুড়ি|খিচুরি|ভাত", CookingPot, "food"),
  rule("fish|seafood|crab|crabs|prawn|prawns|shrimp|lobster|rupchanda|ilish|hilsa|mach", "মাছ|ইলিশ|রূপচাঁদা|কাঁকড়া|চিংড়ি", Fish, "food"),
  rule("chicken|bbq|barbe?cue|grill|kabab|kebab|murgi|shawarma|roast", "মুরগি|চিকেন|কাবাব|গ্রিল|বারবিকিউ", Drumstick, "food"),
  rule("beef|mutton|kala ?bhuna|gosht|meat|steak", "গরু|খাসি|মাংস", Beef, "food"),
  rule("pizza|pizzas", "পিজ্জা", Pizza, "food"),
  rule("burger|burgers|sandwich|sandwiches|hot ?dog|shawarma|roll|rolls", "বার্গার|স্যান্ডউইচ", Sandwich, "food"),
  rule("ice ?cream|kulfi|dessert|faluda|mishti|sweets?|doi|yogh?urt|pitha", "আইসক্রিম|কুলফি|মিষ্টি|দই|পিঠা|ফালুদা", IceCreamCone, "food"),
  rule("water|pani|juice|drinks?|soda|coke|cola|lassi|borhani|dab|coconut", "পানি|জুস|ডাব|লাচ্ছি|বোরহানি|কোক", GlassWater, "food"),
  rule("snacks?|chips|biscuits?|cookies?|nasta|singara|samosa|puri|chotpoti|fuchka|jhalmuri|muri|chanachur|cake|pastry|bread|paratha", "নাস্তা|সিঙ্গারা|সমুচা|পুরি|চটপটি|ফুচকা|ঝালমুড়ি|মুড়ি|চানাচুর|কেক|পরোটা|বিস্কুট", Cookie, "food"),
  rule("fruits?|aam|mango|mangoes|banana|bananas|pineapple|anaros|orange|oranges|litchi|jackfruit", "ফল(?![\\u0980-\\u09FF])|আম(?![\\u0980-\\u09FF])|কলা(?![\\u0980-\\u09FF])|আনারস|কমলা|লিচু|কাঁঠাল", Apple, "food"),
  rule("lunch|dinner|breakfast|brunch|supper|meals?|food|khawa|khabar|restaurant|buffet|thali|vorta|bhorta", "দুপুর|খাবার|খাওয়া|লাঞ্চ|ডিনার|সকালের|রেস্টুরেন্ট|ভর্তা", UtensilsCrossed, "food"),
  rule("hotel|hotels|resort|resorts|room|rooms|cottage|motel|stay|airbnb|guest ?house|hostel|rent|booking|check ?in", "হোটেল|রিসোর্ট|রুম|কটেজ|থাকা|ভাড়া|বুকিং", BedDouble, "stay"),
  rule("tent|tents|camp|camping|bonfire", "তাঁবু|ক্যাম্প", Tent, "stay"),
  rule("guide|guides|porter", "গাইড", Signpost, "fees"),
  rule("ticket|tickets|entry|entrance|fees?|permit|pass|museum|zoo", "টিকেট|টিকিট|প্রবেশ|ফি(?![\\u0980-\\u09FF])|পারমিট", Ticket, "fees"),
  rule("medicine|medicines|pharmacy|oshudh|first ?aid|napa|saline|doctor|hospital", "ওষুধ|ঔষধ|ফার্মেসি|ডাক্তার|স্যালাইন|নাপা", Pill, "other"),
  rule("gift|gifts|souvenirs?|keychain|memento", "উপহার|গিফট|স্যুভেনির", Gift, "gear"),
  rule("sim|recharge|flexi(?:load)?|internet|data|mobile|phone|power ?bank|charger", "সিম|রিচার্জ|ফ্লেক্সি|ইন্টারনেট|মোবাইল", Smartphone, "other"),
  rule("photos?|camera|photographer|drone", "ছবি|ফটো|ক্যামেরা", Camera, "other"),
  rule("tips?|bakshish|donation|charity", "বকশিশ|টিপস|দান(?![\\u0980-\\u09FF])", HandCoins, "other"),
  rule("laundry|wash|ironing|dhobi", "লন্ড্রি|ধোপা", Shirt, "other"),
  rule("shopping|shop|market|bazar|mall|clothes|dress|saree|shari|shawl|shoes?|sandals?|umbrella|sunglass(?:es)?|cap|hat|bag|t-?shirts?", "কেনাকাটা|শপিং|বাজার|মার্কেট|জামা|শাড়ি|শাল|জুতা|ছাতা|টুপি|ব্যাগ", ShoppingBag, "gear"),
];

const ruleFor = (title: string) => RULES.find((r) => r.re.test(title));

/** Icon for an expense: from its title when it says what it was
 *  ("Bus", "সাত রঙের চা", "Kacci"), else from its category. */
export const txnIcon = (title: string, category: CategoryId): LucideIcon =>
  ruleFor(title)?.Icon ?? catIcon(category);

/** Category a title most likely belongs to, or null if it doesn't say. */
export const guessCategory = (title: string): CategoryId | null =>
  ruleFor(title)?.cat ?? null;

// Member avatar palette
export const MEMBER_COLORS = [
  "#2e7d32",
  "#8e5a2e",
  "#3a5f7d",
  "#7d3a5f",
  "#5f7d3a",
  "#b0822e",
  "#3a7d6f",
  "#6f3a7d",
];

export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const money = (n: number, symbol = "৳"): string =>
  symbol +
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export const fmtDateTime = (ts: number): string =>
  new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** "2:30 PM" */
export const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "Today", "Yesterday", "Sat, 12 Jul", "Sat, 12 Jul 2025" */
export const fmtDay = (ts: number): string => {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
};

/** "Today · 2:30 PM", "12 Jul · 9:10 AM" — short enough for a list row */
export const fmtWhen = (ts: number): string => {
  const day = fmtDay(ts);
  const short =
    day === "Today" || day === "Yesterday"
      ? day
      : new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${short} · ${fmtTime(ts)}`;
};

/** Local calendar day key, for grouping lists by day. */
export const dayKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** <input type="datetime-local"> value ↔ timestamp, in local time. */
export const toLocalInput = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string): number => {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : Date.now();
};
