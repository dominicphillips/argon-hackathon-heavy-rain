/** Fictional AUGI demo engineers (local fixture identities, no authentication). */
export interface DemoEngineer {
  id: string;
  name: string;
  initials: string;
  title: string;
  team: string;
}

export const DEMO_ENGINEERS: readonly DemoEngineer[] = [
  { id: "m-okafor", name: "Mara Okafor", initials: "MO", title: "Body structures lead", team: "Sable platform" },
  { id: "j-lindqvist", name: "Jonas Lindqvist", initials: "JL", title: "Chassis dynamics engineer", team: "Sable platform" },
  { id: "r-tanaka", name: "Rin Tanaka", initials: "RT", title: "Battery enclosure engineer", team: "Energy systems" },
];

export const AUGI_ACCOUNT_STORAGE_KEY = "augi.sable.demo.engineer.v1";
export const AUGI_PREFS_STORAGE_KEY = "augi.sable.study.prefs.v1";

export const WORKSPACE_URLS = {
  heavyRain: "http://127.0.0.1:43170/login",
  rookmere: "http://127.0.0.1:43173/login",
  augi: "http://127.0.0.1:43171/login",
} as const;
