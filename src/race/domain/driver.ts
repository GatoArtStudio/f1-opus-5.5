export interface Driver {
  code: string;
  name: string;
  /** Livery colours as 0xRRGGBB. */
  color: number;
  accent: number;
}

export const DRIVER_ROSTER: readonly Driver[] = [
  { code: "ROS", name: "Rossi", color: 0xd8121b, accent: 0xffd400 },
  { code: "HAM", name: "Hammond", color: 0x00a19b, accent: 0x111111 },
  { code: "NOR", name: "Nordahl", color: 0xff8000, accent: 0x1a1a1a },
  { code: "VER", name: "Vermeer", color: 0x1b2a6b, accent: 0xe8002d },
  { code: "ALO", name: "Alonzo", color: 0x0b6b4a, accent: 0xc6ff3a },
  { code: "GAS", name: "Gasquet", color: 0xff5fae, accent: 0x1560bd },
  { code: "ALB", name: "Albers", color: 0x2a5fd6, accent: 0xffffff },
  { code: "HUL", name: "Hulme", color: 0x8f98a3, accent: 0xb3001b },
  { code: "TSU", name: "Tsukada", color: 0x2537a8, accent: 0xffffff },
  { code: "BOT", name: "Bottema", color: 0x7a0019, accent: 0x9a9a9a },
  { code: "SAI", name: "Sainz-Ruiz", color: 0x6e1ad8, accent: 0xffffff },
  { code: "LEC", name: "Leclair", color: 0xffe100, accent: 0x111111 },
];

export const PLAYER_DRIVER: Driver = { code: "YOU", name: "Tú", color: 0xf5f5f5, accent: 0xe10600 };
