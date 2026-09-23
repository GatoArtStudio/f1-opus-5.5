// Global tuning values. Units: metres, seconds, m/s.

export const TRACK = {
  width: 16,        // asphalt width
  kerbWidth: 1.8,
  runoff: 14,       // grass between kerb and barrier
  sampleSpacing: 2, // distance between track samples
  // Control points (x, z) of the closed circuit. Index 0 is the start/finish line.
  controlPoints: [
    [0, 0], [300, 0], [520, 0], [600, 50], [610, 150], [540, 220], [520, 300],
    [590, 380], [600, 480], [520, 560], [380, 560], [280, 500], [180, 520],
    [120, 600], [40, 640], [-40, 600], [-40, 500], [-120, 440], [-260, 460],
    [-380, 520], [-480, 480], [-500, 360], [-430, 270], [-320, 250], [-230, 215],
    [-250, 140], [-350, 115], [-440, 108], [-497, 90], [-517, 55], [-497, 20],
    [-440, 3], [-300, 0],
  ],
};

export const CAR = {
  length: 5.4,
  width: 2.0,
  wheelBase: 3.6,
  maxSpeed: 92,        // ~331 km/h
  engineAccel: 15,     // m/s² at zero speed
  brakeDecel: 40,
  reverseSpeed: 12,
  grip: 36,            // max lateral acceleration on asphalt
  kerbGrip: 30,
  grassGrip: 11,
  grassDrag: 9,
  grassMaxSpeed: 42,
  maxSteer: 0.42,      // wheel angle (rad) at standstill
  collisionRadius: 1.05,
};

export const GEARS = [0, 22, 36, 48, 59, 69, 78, 86, 999]; // upper speed (m/s) of each gear

export const DIFFICULTY = {
  easy:   { skill: [0.80, 0.88], top: [0.90, 0.95] },
  medium: { skill: [0.88, 0.95], top: [0.95, 0.99] },
  hard:   { skill: [0.95, 1.01], top: [0.99, 1.02] },
};

export const DRIVERS = [
  { code: 'ROS', name: 'Rossi',      color: 0xd8121b, accent: 0xffd400 },
  { code: 'HAM', name: 'Hammond',    color: 0x00a19b, accent: 0x111111 },
  { code: 'NOR', name: 'Nordahl',    color: 0xff8000, accent: 0x1a1a1a },
  { code: 'VER', name: 'Vermeer',    color: 0x1b2a6b, accent: 0xe8002d },
  { code: 'ALO', name: 'Alonzo',     color: 0x0b6b4a, accent: 0xc6ff3a },
  { code: 'GAS', name: 'Gasquet',    color: 0xff5fae, accent: 0x1560bd },
  { code: 'ALB', name: 'Albers',     color: 0x2a5fd6, accent: 0xffffff },
  { code: 'HUL', name: 'Hulme',      color: 0x8f98a3, accent: 0xb3001b },
  { code: 'TSU', name: 'Tsukada',    color: 0x2537a8, accent: 0xffffff },
  { code: 'BOT', name: 'Bottema',    color: 0x7a0019, accent: 0x9a9a9a },
  { code: 'SAI', name: 'Sainz-Ruiz', color: 0x6e1ad8, accent: 0xffffff },
  { code: 'LEC', name: 'Leclair',    color: 0xffe100, accent: 0x111111 },
];

export const PLAYER_DRIVER = { code: 'YOU', name: 'Tú', color: 0xf5f5f5, accent: 0xe10600 };
