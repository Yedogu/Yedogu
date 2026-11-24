import os from "node:os";

const NO_COLOR = Boolean(process.env.NO_COLOR);

type RGB = readonly [number, number, number];

function fg([r, g, b]: RGB): string {
  return NO_COLOR ? "" : `\x1b[38;2;${r};${g};${b}m`;
}

function bg([r, g, b]: RGB): string {
  return NO_COLOR ? "" : `\x1b[48;2;${r};${g};${b}m`;
}

export interface ThemeSpec {
  id: string;
  name: string;
  vibe: string;
  accent: RGB;
  accentSoft: RGB;
  text: RGB;
  secondary: RGB;
  muted: RGB;
  border: RGB;
  borderFocus: RGB;
  success: RGB;
  warning: RGB;
  danger: RGB;
  info: RGB;
  reasoning: RGB;
  surfaceBg: RGB;
  surfaceActiveBg: RGB;
  pillBg: RGB;
}

/**
 * Curated termcn.dev + WebTUI terminal color themes.
 * Switchable live via `/theme` or `Ctrl+T` without restarting.
 */
export const THEMES: Record<string, ThemeSpec> = {
  yedogu: {
    id: "yedogu",
    name: "Yedogu",
    vibe: "Pure obsidian canvas with Yedogu lime-emerald & steel blue",
    accent: [96, 165, 250],
    accentSoft: [163, 255, 51],
    text: [244, 244, 245],
    secondary: [161, 161, 170],
    muted: [113, 113, 122],
    border: [42, 42, 46],
    borderFocus: [96, 165, 250],
    success: [74, 222, 128],
    warning: [250, 204, 21],
    danger: [248, 113, 113],
    info: [96, 165, 250],
    reasoning: [192, 132, 252],
    surfaceBg: [10, 10, 10],
    surfaceActiveBg: [34, 48, 68],
    pillBg: [22, 22, 24],
  },
  claude: {
    id: "claude",
    name: "Claude Warm",
    vibe: "Warm terracotta editorial minimalism",
    accent: [217, 119, 87],
    accentSoft: [232, 160, 134],
    text: [236, 234, 228],
    secondary: [168, 164, 156],
    muted: [118, 114, 108],
    border: [68, 65, 60],
    borderFocus: [122, 106, 94],
    success: [110, 194, 148],
    warning: [229, 181, 103],
    danger: [224, 108, 117],
    info: [122, 162, 247],
    reasoning: [180, 151, 214],
    surfaceBg: [30, 29, 27],
    surfaceActiveBg: [48, 44, 40],
    pillBg: [42, 40, 37],
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    vibe: "Soothing pastel mauve & peach",
    accent: [203, 166, 247],
    accentSoft: [245, 194, 231],
    text: [205, 214, 244],
    secondary: [166, 173, 200],
    muted: [127, 132, 156],
    border: [69, 71, 90],
    borderFocus: [137, 180, 250],
    success: [166, 227, 161],
    warning: [249, 226, 175],
    danger: [243, 139, 168],
    info: [137, 220, 235],
    reasoning: [180, 190, 254],
    surfaceBg: [30, 30, 46],
    surfaceActiveBg: [49, 50, 68],
    pillBg: [39, 40, 58],
  },
  tokyonight: {
    id: "tokyonight",
    name: "Tokyo Night",
    vibe: "Crisp neon indigo & electric sky",
    accent: [122, 162, 247],
    accentSoft: [125, 207, 255],
    text: [192, 202, 245],
    secondary: [169, 177, 214],
    muted: [86, 95, 137],
    border: [59, 66, 97],
    borderFocus: [122, 162, 247],
    success: [158, 206, 106],
    warning: [224, 175, 104],
    danger: [247, 118, 142],
    info: [125, 207, 255],
    reasoning: [187, 154, 247],
    surfaceBg: [26, 27, 38],
    surfaceActiveBg: [41, 46, 66],
    pillBg: [36, 40, 59],
  },
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox Dark",
    vibe: "Retro groove amber, aqua & cream",
    accent: [254, 128, 25],
    accentSoft: [250, 189, 47],
    text: [235, 219, 178],
    secondary: [189, 174, 147],
    muted: [146, 131, 116],
    border: [80, 73, 69],
    borderFocus: [214, 93, 14],
    success: [184, 187, 38],
    warning: [250, 189, 47],
    danger: [251, 73, 52],
    info: [131, 165, 152],
    reasoning: [211, 134, 155],
    surfaceBg: [40, 40, 40],
    surfaceActiveBg: [60, 56, 54],
    pillBg: [50, 48, 47],
  },
  nord: {
    id: "nord",
    name: "Nord",
    vibe: "Arctic frost blues & calm snow",
    accent: [136, 192, 208],
    accentSoft: [143, 188, 187],
    text: [236, 239, 244],
    secondary: [216, 222, 233],
    muted: [129, 143, 168],
    border: [67, 76, 94],
    borderFocus: [129, 161, 193],
    success: [163, 190, 140],
    warning: [235, 203, 139],
    danger: [191, 97, 106],
    info: [129, 161, 193],
    reasoning: [180, 142, 173],
    surfaceBg: [46, 52, 64],
    surfaceActiveBg: [59, 66, 82],
    pillBg: [52, 59, 73],
  },
  vitesse: {
    id: "vitesse",
    name: "Vitesse Dark",
    vibe: "Minimalist botanical sage & sand",
    accent: [77, 147, 117],
    accentSoft: [128, 166, 101],
    text: [219, 215, 202],
    secondary: [165, 162, 152],
    muted: [117, 113, 104],
    border: [57, 58, 52],
    borderFocus: [77, 147, 117],
    success: [77, 147, 117],
    warning: [230, 204, 119],
    danger: [203, 118, 118],
    info: [99, 148, 191],
    reasoning: [217, 115, 159],
    surfaceBg: [24, 24, 24],
    surfaceActiveBg: [41, 41, 41],
    pillBg: [34, 34, 34],
  },
  dracula: {
    id: "dracula",
    name: "Dracula",
    vibe: "High-contrast violet, cyan & green",
    accent: [189, 147, 249],
    accentSoft: [255, 121, 198],
    text: [248, 248, 242],
    secondary: [189, 194, 214],
    muted: [98, 114, 164],
    border: [68, 71, 90],
    borderFocus: [189, 147, 249],
    success: [80, 250, 123],
    warning: [241, 250, 140],
    danger: [255, 85, 85],
    info: [139, 233, 253],
    reasoning: [255, 121, 198],
    surfaceBg: [40, 42, 54],
    surfaceActiveBg: [68, 71, 90],
    pillBg: [52, 55, 70],
  },
  everforest: {
    id: "everforest",
    name: "Everforest Dark",
    vibe: "Warm forest moss, clay & pine",
    accent: [167, 192, 128],
    accentSoft: [131, 192, 146],
    text: [211, 198, 170],
    secondary: [157, 169, 160],
    muted: [122, 132, 120],
    border: [71, 82, 88],
    borderFocus: [167, 192, 128],
    success: [167, 192, 128],
    warning: [219, 188, 127],
    danger: [230, 126, 128],
    info: [127, 187, 179],
    reasoning: [214, 153, 182],
    surfaceBg: [45, 53, 59],
    surfaceActiveBg: [61, 72, 77],
    pillBg: [52, 63, 68],
  },
  osmium: {
    id: "osmium",
    name: "WebTUI Osmium",
    vibe: "Metallic slate, electric azure & lilac",
    accent: [154, 191, 232],
    accentSoft: [176, 168, 235],
    text: [230, 235, 244],
    secondary: [156, 170, 192],
    muted: [106, 118, 138],
    border: [64, 73, 95],
    borderFocus: [154, 191, 232],
    success: [201, 222, 150],
    warning: [235, 177, 123],
    danger: [229, 83, 118],
    info: [154, 191, 232],
    reasoning: [217, 161, 232],
    surfaceBg: [27, 30, 39],
    surfaceActiveBg: [48, 56, 73],
    pillBg: [36, 41, 54],
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    vibe: "Crisp neutral charcoal & electric amber",
    accent: [250, 178, 131],
    accentSoft: [255, 210, 175],
    text: [238, 238, 238],
    secondary: [168, 168, 168],
    muted: [128, 128, 128],
    border: [60, 60, 60],
    borderFocus: [250, 178, 131],
    success: [127, 216, 143],
    warning: [245, 167, 66],
    danger: [224, 108, 117],
    info: [92, 156, 245],
    reasoning: [157, 124, 216],
    surfaceBg: [10, 10, 10],
    surfaceActiveBg: [30, 30, 30],
    pillBg: [20, 20, 20],
  },
  "opencode-classic": {
    id: "opencode-classic",
    name: "OpenCode Classic",
    vibe: "Classic dark slate & coral orange",
    accent: [250, 178, 131],
    accentSoft: [232, 160, 134],
    text: [230, 230, 230],
    secondary: [160, 160, 160],
    muted: [115, 115, 115],
    border: [58, 58, 58],
    borderFocus: [250, 178, 131],
    success: [127, 216, 143],
    warning: [245, 167, 66],
    danger: [224, 108, 117],
    info: [92, 156, 245],
    reasoning: [180, 151, 214],
    surfaceBg: [16, 16, 18],
    surfaceActiveBg: [36, 36, 40],
    pillBg: [26, 26, 30],
  },
  aura: {
    id: "aura",
    name: "Aura",
    vibe: "Deep obsidian with neon purple & mint",
    accent: [162, 119, 255],
    accentSoft: [97, 255, 202],
    text: [237, 236, 238],
    secondary: [180, 176, 196],
    muted: [109, 109, 109],
    border: [59, 55, 75],
    borderFocus: [162, 119, 255],
    success: [97, 255, 202],
    warning: [255, 202, 133],
    danger: [255, 103, 103],
    info: [130, 226, 255],
    reasoning: [246, 148, 255],
    surfaceBg: [21, 20, 27],
    surfaceActiveBg: [41, 38, 54],
    pillBg: [31, 29, 41],
  },
  ayu: {
    id: "ayu",
    name: "Ayu Dark",
    vibe: "Midnight ink with warm marigold & sky",
    accent: [255, 180, 84],
    accentSoft: [242, 150, 104],
    text: [191, 189, 182],
    secondary: [148, 155, 165],
    muted: [86, 91, 102],
    border: [45, 51, 63],
    borderFocus: [255, 180, 84],
    success: [170, 217, 76],
    warning: [255, 180, 84],
    danger: [240, 113, 120],
    info: [89, 194, 255],
    reasoning: [210, 166, 255],
    surfaceBg: [13, 16, 23],
    surfaceActiveBg: [27, 33, 46],
    pillBg: [20, 24, 34],
  },
  "catppuccin-frappe": {
    id: "catppuccin-frappe",
    name: "Catppuccin Frappé",
    vibe: "Muted twilight lavender & rosewater",
    accent: [202, 158, 230],
    accentSoft: [244, 184, 228],
    text: [198, 208, 245],
    secondary: [165, 173, 206],
    muted: [115, 121, 148],
    border: [81, 87, 109],
    borderFocus: [140, 170, 238],
    success: [166, 209, 137],
    warning: [229, 200, 144],
    danger: [231, 130, 132],
    info: [133, 193, 220],
    reasoning: [186, 187, 241],
    surfaceBg: [48, 52, 70],
    surfaceActiveBg: [65, 69, 89],
    pillBg: [56, 60, 79],
  },
  "catppuccin-macchiato": {
    id: "catppuccin-macchiato",
    name: "Catppuccin Macchiato",
    vibe: "Velvet indigo with pastel flamingo",
    accent: [198, 160, 246],
    accentSoft: [245, 189, 230],
    text: [202, 211, 245],
    secondary: [165, 173, 203],
    muted: [110, 115, 141],
    border: [73, 77, 100],
    borderFocus: [138, 173, 244],
    success: [166, 218, 149],
    warning: [238, 212, 159],
    danger: [237, 135, 150],
    info: [125, 196, 228],
    reasoning: [183, 189, 248],
    surfaceBg: [36, 39, 58],
    surfaceActiveBg: [54, 58, 79],
    pillBg: [44, 48, 68],
  },
  cobalt2: {
    id: "cobalt2",
    name: "Cobalt2",
    vibe: "Classic cobalt navy & bright gold",
    accent: [255, 198, 0],
    accentSoft: [255, 157, 0],
    text: [255, 255, 255],
    secondary: [173, 198, 238],
    muted: [0, 136, 255],
    border: [25, 53, 73],
    borderFocus: [255, 198, 0],
    success: [58, 217, 0],
    warning: [255, 198, 0],
    danger: [255, 98, 140],
    info: [128, 252, 255],
    reasoning: [251, 148, 255],
    surfaceBg: [25, 53, 73],
    surfaceActiveBg: [35, 78, 109],
    pillBg: [21, 44, 61],
  },
  cursor: {
    id: "cursor",
    name: "Cursor Dark",
    vibe: "Monochrome graphite with crisp azure",
    accent: [136, 192, 208],
    accentSoft: [170, 210, 225],
    text: [228, 228, 228],
    secondary: [160, 160, 160],
    muted: [110, 110, 110],
    border: [52, 52, 56],
    borderFocus: [136, 192, 208],
    success: [137, 209, 133],
    warning: [229, 192, 123],
    danger: [224, 108, 117],
    info: [97, 175, 239],
    reasoning: [198, 120, 221],
    surfaceBg: [24, 24, 27],
    surfaceActiveBg: [39, 39, 42],
    pillBg: [32, 32, 35],
  },
  flexoki: {
    id: "flexoki",
    name: "Flexoki Dark",
    vibe: "Inky paper contrast with warm ochre",
    accent: [208, 162, 21],
    accentSoft: [218, 112, 44],
    text: [206, 205, 195],
    secondary: [135, 133, 128],
    muted: [87, 86, 83],
    border: [52, 51, 49],
    borderFocus: [208, 162, 21],
    success: [135, 154, 57],
    warning: [208, 162, 21],
    danger: [209, 77, 65],
    info: [67, 133, 190],
    reasoning: [139, 126, 200],
    surfaceBg: [16, 15, 15],
    surfaceActiveBg: [40, 39, 38],
    pillBg: [28, 27, 26],
  },
  github: {
    id: "github",
    name: "GitHub Dark",
    vibe: "Clean primer slate & octocat blue",
    accent: [88, 166, 255],
    accentSoft: [121, 192, 255],
    text: [230, 237, 243],
    secondary: [139, 148, 158],
    muted: [110, 118, 129],
    border: [48, 54, 61],
    borderFocus: [88, 166, 255],
    success: [63, 185, 80],
    warning: [210, 153, 34],
    danger: [248, 81, 73],
    info: [88, 166, 255],
    reasoning: [188, 140, 255],
    surfaceBg: [13, 17, 23],
    surfaceActiveBg: [33, 38, 45],
    pillBg: [22, 27, 34],
  },
  kanagawa: {
    id: "kanagawa",
    name: "Kanagawa",
    vibe: "Sumi-ink indigo & wave crystal blue",
    accent: [126, 156, 216],
    accentSoft: [127, 180, 202],
    text: [220, 215, 186],
    secondary: [200, 192, 147],
    muted: [114, 113, 105],
    border: [54, 54, 70],
    borderFocus: [126, 156, 216],
    success: [152, 187, 108],
    warning: [230, 195, 132],
    danger: [228, 104, 118],
    info: [127, 180, 202],
    reasoning: [149, 127, 184],
    surfaceBg: [31, 31, 40],
    surfaceActiveBg: [54, 54, 70],
    pillBg: [42, 42, 55],
  },
  material: {
    id: "material",
    name: "Material Ocean",
    vibe: "Oceanic slate with cyan &coral",
    accent: [130, 170, 255],
    accentSoft: [137, 221, 255],
    text: [238, 255, 255],
    secondary: [143, 147, 162],
    muted: [70, 75, 93],
    border: [41, 45, 62],
    borderFocus: [130, 170, 255],
    success: [195, 232, 141],
    warning: [255, 203, 107],
    danger: [240, 113, 120],
    info: [137, 221, 255],
    reasoning: [199, 146, 234],
    surfaceBg: [15, 17, 26],
    surfaceActiveBg: [31, 34, 51],
    pillBg: [24, 26, 39],
  },
  matrix: {
    id: "matrix",
    name: "Matrix",
    vibe: "Phosphor green on pure black terminal",
    accent: [46, 255, 106],
    accentSoft: [120, 255, 160],
    text: [200, 255, 214],
    secondary: [102, 204, 130],
    muted: [50, 120, 70],
    border: [22, 66, 36],
    borderFocus: [46, 255, 106],
    success: [46, 255, 106],
    warning: [230, 220, 90],
    danger: [255, 85, 85],
    info: [0, 229, 170],
    reasoning: [130, 255, 200],
    surfaceBg: [8, 12, 9],
    surfaceActiveBg: [16, 36, 22],
    pillBg: [12, 24, 16],
  },
  mercury: {
    id: "mercury",
    name: "Mercury",
    vibe: "Quicksilver neutral with cool teal",
    accent: [110, 200, 210],
    accentSoft: [150, 220, 230],
    text: [230, 232, 236],
    secondary: [164, 168, 176],
    muted: [112, 116, 124],
    border: [58, 60, 66],
    borderFocus: [110, 200, 210],
    success: [130, 210, 150],
    warning: [230, 190, 110],
    danger: [225, 105, 115],
    info: [110, 200, 210],
    reasoning: [175, 150, 225],
    surfaceBg: [24, 25, 28],
    surfaceActiveBg: [42, 44, 50],
    pillBg: [32, 34, 38],
  },
  monokai: {
    id: "monokai",
    name: "Monokai",
    vibe: "Iconic olive-charcoal, magenta & lime",
    accent: [249, 38, 114],
    accentSoft: [253, 151, 31],
    text: [248, 248, 242],
    secondary: [207, 207, 194],
    muted: [117, 113, 94],
    border: [73, 72, 62],
    borderFocus: [249, 38, 114],
    success: [166, 226, 46],
    warning: [230, 219, 116],
    danger: [249, 38, 114],
    info: [102, 217, 239],
    reasoning: [174, 129, 255],
    surfaceBg: [39, 40, 34],
    surfaceActiveBg: [62, 61, 50],
    pillBg: [49, 50, 42],
  },
  nightowl: {
    id: "nightowl",
    name: "Night Owl",
    vibe: "Deep midnight navy & luminous cyan",
    accent: [130, 170, 255],
    accentSoft: [127, 219, 202],
    text: [214, 222, 235],
    secondary: [155, 175, 200],
    muted: [99, 119, 119],
    border: [29, 59, 83],
    borderFocus: [130, 170, 255],
    success: [173, 219, 103],
    warning: [255, 203, 139],
    danger: [239, 83, 80],
    info: [127, 219, 202],
    reasoning: [199, 146, 234],
    surfaceBg: [1, 22, 39],
    surfaceActiveBg: [11, 41, 66],
    pillBg: [7, 31, 52],
  },
  "one-dark": {
    id: "one-dark",
    name: "One Dark",
    vibe: "Atom iconic slate, sky blue & coral",
    accent: [97, 175, 239],
    accentSoft: [86, 182, 194],
    text: [171, 178, 191],
    secondary: [130, 137, 151],
    muted: [92, 99, 112],
    border: [62, 68, 81],
    borderFocus: [97, 175, 239],
    success: [152, 195, 121],
    warning: [229, 192, 123],
    danger: [224, 108, 117],
    info: [86, 182, 194],
    reasoning: [198, 120, 221],
    surfaceBg: [40, 44, 52],
    surfaceActiveBg: [58, 63, 75],
    pillBg: [49, 53, 63],
  },
  "osaka-jade": {
    id: "osaka-jade",
    name: "Osaka Jade",
    vibe: "Deep jade forest & luminous celadon",
    accent: [84, 207, 163],
    accentSoft: [143, 230, 196],
    text: [222, 235, 228],
    secondary: [152, 176, 166],
    muted: [94, 118, 108],
    border: [39, 58, 52],
    borderFocus: [84, 207, 163],
    success: [84, 207, 163],
    warning: [232, 196, 118],
    danger: [230, 112, 120],
    info: [104, 196, 224],
    reasoning: [178, 148, 224],
    surfaceBg: [17, 25, 22],
    surfaceActiveBg: [29, 44, 38],
    pillBg: [22, 34, 29],
  },
  orng: {
    id: "orng",
    name: "ORNG",
    vibe: "Industrial carbon & high-vis tangerine",
    accent: [255, 112, 42],
    accentSoft: [255, 164, 108],
    text: [238, 238, 238],
    secondary: [170, 170, 170],
    muted: [112, 112, 112],
    border: [54, 54, 54],
    borderFocus: [255, 112, 42],
    success: [110, 214, 140],
    warning: [255, 186, 66],
    danger: [240, 90, 98],
    info: [100, 176, 255],
    reasoning: [186, 138, 240],
    surfaceBg: [18, 18, 18],
    surfaceActiveBg: [36, 36, 36],
    pillBg: [26, 26, 26],
  },
  "lucent-orng": {
    id: "lucent-orng",
    name: "Lucent ORNG",
    vibe: "Translucent obsidian & amber glow",
    accent: [255, 136, 68],
    accentSoft: [255, 182, 132],
    text: [242, 240, 236],
    secondary: [180, 176, 170],
    muted: [120, 118, 114],
    border: [62, 58, 54],
    borderFocus: [255, 136, 68],
    success: [122, 220, 150],
    warning: [255, 195, 85],
    danger: [242, 98, 106],
    info: [112, 186, 255],
    reasoning: [194, 148, 244],
    surfaceBg: [22, 21, 20],
    surfaceActiveBg: [42, 39, 36],
    pillBg: [31, 29, 27],
  },
  palenight: {
    id: "palenight",
    name: "Palenight",
    vibe: "Soft twilight violet & electric cyan",
    accent: [199, 146, 234],
    accentSoft: [130, 170, 255],
    text: [191, 199, 213],
    secondary: [149, 157, 178],
    muted: [103, 110, 149],
    border: [68, 72, 102],
    borderFocus: [199, 146, 234],
    success: [195, 232, 141],
    warning: [255, 203, 107],
    danger: [240, 113, 120],
    info: [137, 221, 255],
    reasoning: [199, 146, 234],
    surfaceBg: [41, 45, 62],
    surfaceActiveBg: [58, 63, 88],
    pillBg: [49, 54, 74],
  },
  rosepine: {
    id: "rosepine",
    name: "Rosé Pine",
    vibe: "Muted plum, rose gold & iris",
    accent: [235, 188, 186],
    accentSoft: [196, 167, 231],
    text: [224, 222, 244],
    secondary: [144, 140, 170],
    muted: [110, 106, 134],
    border: [57, 53, 82],
    borderFocus: [235, 188, 186],
    success: [156, 207, 216],
    warning: [246, 193, 119],
    danger: [235, 111, 146],
    info: [49, 116, 143],
    reasoning: [196, 167, 231],
    surfaceBg: [25, 23, 36],
    surfaceActiveBg: [38, 35, 58],
    pillBg: [31, 29, 46],
  },
  solarized: {
    id: "solarized",
    name: "Solarized Dark",
    vibe: "Precision teal base03 & solar accents",
    accent: [38, 139, 210],
    accentSoft: [42, 161, 152],
    text: [147, 161, 161],
    secondary: [131, 148, 150],
    muted: [88, 110, 117],
    border: [7, 54, 66],
    borderFocus: [38, 139, 210],
    success: [133, 153, 0],
    warning: [181, 137, 0],
    danger: [220, 50, 47],
    info: [42, 161, 152],
    reasoning: [108, 113, 196],
    surfaceBg: [0, 43, 54],
    surfaceActiveBg: [7, 54, 66],
    pillBg: [4, 48, 60],
  },
  synthwave84: {
    id: "synthwave84",
    name: "Synthwave '84",
    vibe: "Retro neon magenta, laser cyan & plum",
    accent: [255, 126, 219],
    accentSoft: [54, 249, 246],
    text: [255, 255, 255],
    secondary: [182, 177, 209],
    muted: [132, 139, 189],
    border: [73, 59, 108],
    borderFocus: [255, 126, 219],
    success: [114, 241, 184],
    warning: [254, 222, 93],
    danger: [254, 68, 80],
    info: [54, 249, 246],
    reasoning: [255, 126, 219],
    surfaceBg: [38, 35, 53],
    surfaceActiveBg: [52, 41, 79],
    pillBg: [45, 38, 66],
  },
  vesper: {
    id: "vesper",
    name: "Vesper",
    vibe: "Pure ink black with warm apricot & mint",
    accent: [255, 199, 153],
    accentSoft: [153, 255, 228],
    text: [255, 255, 255],
    secondary: [160, 160, 160],
    muted: [100, 100, 100],
    border: [46, 46, 46],
    borderFocus: [255, 199, 153],
    success: [153, 255, 228],
    warning: [255, 199, 153],
    danger: [255, 128, 128],
    info: [160, 210, 255],
    reasoning: [210, 170, 255],
    surfaceBg: [16, 16, 16],
    surfaceActiveBg: [34, 34, 34],
    pillBg: [24, 24, 24],
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    vibe: "Geist monochrome & sharp electric blue",
    accent: [0, 112, 243],
    accentSoft: [82, 168, 255],
    text: [237, 237, 237],
    secondary: [161, 161, 161],
    muted: [115, 115, 115],
    border: [46, 46, 46],
    borderFocus: [0, 112, 243],
    success: [70, 167, 88],
    warning: [255, 180, 0],
    danger: [229, 72, 77],
    info: [82, 168, 255],
    reasoning: [190, 147, 228],
    surfaceBg: [0, 0, 0],
    surfaceActiveBg: [26, 26, 26],
    pillBg: [17, 17, 17],
  },
  zenburn: {
    id: "zenburn",
    name: "Zenburn",
    vibe: "Low-contrast warm sage, sand & terracotta",
    accent: [240, 223, 175],
    accentSoft: [220, 163, 163],
    text: [220, 220, 204],
    secondary: [189, 189, 175],
    muted: [127, 159, 127],
    border: [79, 79, 79],
    borderFocus: [240, 223, 175],
    success: [127, 159, 127],
    warning: [240, 223, 175],
    danger: [204, 147, 147],
    info: [140, 208, 211],
    reasoning: [220, 163, 163],
    surfaceBg: [63, 63, 63],
    surfaceActiveBg: [79, 79, 79],
    pillBg: [70, 70, 70],
  },
  carbonfox: {
    id: "carbonfox",
    name: "Carbonfox",
    vibe: "IBM Carbon charcoal & cool ice blue",
    accent: [120, 169, 255],
    accentSoft: [51, 177, 255],
    text: [242, 244, 248],
    secondary: [182, 184, 187],
    muted: [123, 124, 126],
    border: [53, 53, 53],
    borderFocus: [120, 169, 255],
    success: [66, 190, 101],
    warning: [255, 171, 145],
    danger: [238, 83, 150],
    info: [51, 177, 255],
    reasoning: [190, 149, 255],
    surfaceBg: [22, 22, 22],
    surfaceActiveBg: [42, 42, 42],
    pillBg: [32, 32, 32],
  },
};

export function blendRgb(bgRgb: RGB, fgRgb: RGB, alpha = 0.25): RGB {
  return [
    Math.round(bgRgb[0] + (fgRgb[0] - bgRgb[0]) * alpha),
    Math.round(bgRgb[1] + (fgRgb[1] - bgRgb[1]) * alpha),
    Math.round(bgRgb[2] + (fgRgb[2] - bgRgb[2]) * alpha),
  ];
}

/**
 * OpenCode-style 4x4 shaded pixel-block YEDOGU logo.
 * Uses OpenCode's exact glyph shading markers (`_`, `^`, `~`, `,`) with 25% shadow blending.
 */
export const YEDOGU_LOGO = {
  left: [
    "             ▄",
    "█__█ █▀▀█ █▀▀█",
    "▀▀▀█ █^^^ █__█",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
  ],
  right: [
    "              ",
    "█▀▀█ █▀▀▀ █__█",
    "█__█ █_^█ █__█",
    "▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
  ],
} as const;

function renderLogoRow(pattern: string, colorRgb: RGB, bold: boolean): string {
  if (NO_COLOR) {
    return pattern.replace(/_/g, " ").replace(/\^|~/g, "▀").replace(/,/g, "▄");
  }
  const shadow = blendRgb(activeTheme.surfaceBg, colorRgb, 0.25);
  const weight = bold ? "\x1b[1m" : "";
  let out = "";
  for (const ch of pattern) {
    if (ch === "_") {
      out += `${weight}${fg(colorRgb)}${bg(shadow)} \x1b[0m`;
    } else if (ch === "^") {
      out += `${weight}${fg(colorRgb)}${bg(shadow)}\u2580\x1b[0m`;
    } else if (ch === "~") {
      out += `${weight}${fg(shadow)}\u2580\x1b[0m`;
    } else if (ch === ",") {
      out += `${weight}${fg(shadow)}\u2584\x1b[0m`;
    } else {
      out += `${weight}${fg(colorRgb)}${ch}\x1b[0m`;
    }
  }
  return out;
}

/**
 * Renders the official Yedogu stepped pixel-art `Y` emblem from `logos/yedogulogo.png`
 * using TrueColor Unicode half-blocks (electric lime -> emerald gradient + icy-mint dot).
 */
export function renderYedoguEmblem(): string[] {
  if (NO_COLOR) {
    return ["▀▄ ▄▀", " ▀█▀ ", "  █  ", "  ▄  "];
  }
  const L1: RGB = [163, 255, 51];   // #a3ff33 bright lime
  const L2: RGB = [110, 238, 65];   // #6eee41 upper arms
  const G1: RGB = [52, 211, 105];   // #34d369 mid green
  const G2: RGB = [16, 185, 129];   // #10b981 emerald fork
  const G3: RGB = [5, 150, 105];    // #059669 deep stem
  const MINT: RGB = [209, 250, 229]; // #d1fae5 icy-mint bottom square

  return [
    `${fg(L1)}██${fg(L2)}▄${fg(L1)} ${fg(L2)}▄${fg(L1)}██\x1b[0m`,
    ` ${fg(L2)}▀${fg(G1)}█${fg(L2)}▀${fg(G1)}█${fg(L2)}▀ \x1b[0m`,
    `  ${fg(G2)}█${fg(G3)}█${fg(G2)}█  \x1b[0m`,
    `  ${fg(G3)}▀${fg(MINT)}▄${fg(G3)}▀  \x1b[0m`,
  ];
}

/**
 * Renders the colored 3D pixel-block YEDOGU logo:
 * Official `logos/yedogulogo.png` pixel `Y` emblem + OpenCode-style two-tone `yed` + `ogu` wordmark.
 */
export function renderYedoguLogo(maxWidth = termWidth(80, 40), center = true): string {
  const emblem = renderYedoguEmblem();
  const leftColor: RGB = activeTheme.secondary;
  const rightColor: RGB = activeTheme.text;
  const lines: string[] = [];

  if (maxWidth < 40) {
    for (const row of emblem) lines.push(row);
  } else {
    for (let i = 0; i < YEDOGU_LOGO.left.length; i++) {
      const em = emblem[i] ?? "       ";
      const l = renderLogoRow(YEDOGU_LOGO.left[i], leftColor, false);
      const r = renderLogoRow(YEDOGU_LOGO.right[i], rightColor, true);
      lines.push(`${em}  ${l} ${r}`);
    }
  }

  return lines
    .map((line) => {
      if (!center) return `  ${line}`;
      const vis = visibleLength(line);
      const pad = Math.max(2, Math.floor((maxWidth - vis) / 2));
      return `${" ".repeat(pad)}${line}`;
    })
    .join("\n");
}

export function osc52Copy(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return `\x1b]52;c;${b64}\x07`;
}

const LEGACY_THEME_MAP: Record<string, string> = {
  obsidian: "claude",
  emerald: "vitesse",
  amber: "gruvbox",
};

let activeTheme: ThemeSpec = THEMES.yedogu;

export function listThemes(): ThemeSpec[] {
  return Object.values(THEMES);
}

export function getActiveTheme(): ThemeSpec {
  return activeTheme;
}

export function setActiveTheme(themeId: string): ThemeSpec {
  const key = (themeId || "claude").trim().toLowerCase();
  const resolved = LEGACY_THEME_MAP[key] || key;
  if (THEMES[resolved]) {
    activeTheme = THEMES[resolved];
  }
  return activeTheme;
}

/**
 * Renders a compact 4-block TrueColor swatch preview for the `/theme` picker pop-up.
 */
export function renderThemeSwatch(spec: ThemeSpec): string {
  if (NO_COLOR) return "[theme]";
  return (
    `${fg(spec.accent)}█` +
    `${fg(spec.info)}█` +
    `${fg(spec.success)}█` +
    `${fg(spec.warning)}█` +
    `${fg(spec.danger)}█\x1b[0m`
  );
}

/**
 * Dynamic PALETTE backed by getters so switching themes via `/theme`
 * re-skins every component across the terminal instantaneously.
 */
export const PALETTE = {
  get reset() { return NO_COLOR ? "" : "\x1b[0m"; },
  get bold() { return NO_COLOR ? "" : "\x1b[1m"; },
  get dim() { return NO_COLOR ? "" : "\x1b[2m"; },
  get italic() { return NO_COLOR ? "" : "\x1b[3m"; },
  get underline() { return NO_COLOR ? "" : "\x1b[4m"; },

  get accent() { return fg(activeTheme.accent); },
  get accentSoft() { return fg(activeTheme.accentSoft); },
  get text() { return fg(activeTheme.text); },
  get secondary() { return fg(activeTheme.secondary); },
  get muted() { return fg(activeTheme.muted); },
  get border() { return fg(activeTheme.border); },
  get borderFocus() { return fg(activeTheme.borderFocus); },

  get success() { return fg(activeTheme.success); },
  get warning() { return fg(activeTheme.warning); },
  get danger() { return fg(activeTheme.danger); },
  get info() { return fg(activeTheme.info); },
  get reasoning() { return fg(activeTheme.reasoning); },

  get surfaceBg() { return bg(activeTheme.surfaceBg); },
  get surfaceActiveBg() { return bg(activeTheme.surfaceActiveBg); },
  get pillBg() { return bg(activeTheme.pillBg); },

  // OpenCode semantic tokens (v1/v2 unified)
  get primary() { return fg(activeTheme.accent); },
  get backgroundPanel() { return bg(activeTheme.pillBg); },
  get backgroundElement() { return bg(activeTheme.surfaceActiveBg); },
  get borderActive() { return fg(activeTheme.borderFocus); },
  get borderSubtle() { return fg(blendRgb(activeTheme.surfaceBg, activeTheme.border, 0.55)); },
  get diffAdded() { return fg(activeTheme.success); },
  get diffRemoved() { return fg(activeTheme.danger); },
  get diffHunkHeader() { return fg(activeTheme.info); },
  get diffAddedBg() { return bg(blendRgb(activeTheme.surfaceBg, activeTheme.success, 0.16)); },
  get diffRemovedBg() { return bg(blendRgb(activeTheme.surfaceBg, activeTheme.danger, 0.16)); },
  get syntaxKeyword() { return fg(activeTheme.reasoning); },
  get syntaxString() { return fg(activeTheme.success); },
  get syntaxComment() { return fg(activeTheme.muted); },
  get syntaxFunction() { return fg(activeTheme.info); },
  get syntaxNumber() { return fg(activeTheme.warning); },
  get syntaxType() { return fg(activeTheme.accentSoft); },
  get markdownHeading() { return fg(activeTheme.accent); },
  get markdownCode() { return fg(activeTheme.info); },
  get markdownLink() { return fg(activeTheme.info); },
};

/**
 * Synchronized terminal output (DEC Mode 2026) prevents flicker during interactive redraws.
 * Safely ignored by terminals that do not support it.
 */
export const SYNC_START = "\x1b[?2026h";
export const SYNC_END = "\x1b[?2026l";

/**
 * Backwards-compatible ANSI export mapped dynamically to the active theme.
 */
export const ANSI = {
  get reset() { return PALETTE.reset; },
  get bold() { return PALETTE.bold; },
  get dim() { return PALETTE.dim; },
  get italic() { return PALETTE.italic; },
  get underline() { return PALETTE.underline; },
  get accent() { return PALETTE.accent; },
  get cyan() { return PALETTE.info; },
  get emerald() { return PALETTE.success; },
  get amber() { return PALETTE.warning; },
  get rose() { return PALETTE.danger; },
  get purple() { return PALETTE.reasoning; },
  get blue() { return PALETTE.info; },
  get gray() { return PALETTE.secondary; },
  get darkGray() { return PALETTE.border; },
  get muted() { return PALETTE.muted; },
  get white() { return PALETTE.text; },
};

export function c(color: string, text: string): string {
  if (!color || NO_COLOR) return text;
  return `${color}${text}${PALETTE.reset}`;
}

export function kbd(label: string): string {
  if (NO_COLOR) return `[${label}]`;
  return `${PALETTE.pillBg}${PALETTE.secondary} ${label} ${PALETTE.reset}`;
}

export function badge(label: string, color = PALETTE.secondary): string {
  if (NO_COLOR) return `[${label}]`;
  return `${PALETTE.pillBg}${color} ${label} ${PALETTE.reset}`;
}

/**
 * Compact termcn-style mini context gauge (e.g., `▰▰▱▱▱ 18%`).
 */
export function renderMiniGauge(used: number, max = 200_000, width = 5): string {
  if (used <= 0) return "";
  const ratio = Math.max(0, Math.min(1, used / max));
  const filled = Math.max(used > 0 ? 1 : 0, Math.round(ratio * width));
  const empty = Math.max(0, width - filled);
  const fillCol = ratio > 0.8 ? PALETTE.danger : ratio > 0.55 ? PALETTE.warning : PALETTE.accent;
  const pct = Math.min(99, Math.max(1, Math.round(ratio * 100)));
  return `${c(fillCol, "▰".repeat(filled))}${c(PALETTE.border, "▱".repeat(empty))} ${c(PALETTE.muted, `${pct}%`)}`;
}

const ANSI_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

export function padVisible(str: string, width: number, align: "left" | "right" = "left"): string {
  const len = visibleLength(str);
  if (len >= width) return str;
  const pad = " ".repeat(width - len);
  return align === "right" ? pad + str : str + pad;
}

/**
 * ANSI-safe truncation that preserves styling and appends an ellipsis if needed.
 */
export function clipVisible(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (visibleLength(str) <= maxLen) return str;
  const target = Math.max(1, maxLen - 1);
  let out = "";
  let vis = 0;
  let i = 0;
  let sawAnsi = false;
  while (i < str.length && vis < target) {
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const m = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(str.slice(i));
      if (m) {
        out += m[0];
        if (m[0].endsWith("m")) sawAnsi = true;
        i += m[0].length;
        continue;
      }
    }
    out += str[i];
    vis++;
    i++;
  }
  return out + "…" + (sawAnsi && !NO_COLOR ? PALETTE.reset : "");
}

export function truncatePlain(str: string, maxLen: number): string {
  if (maxLen <= 3) return str.slice(0, Math.max(0, maxLen));
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

export function termWidth(max = 92, min = 56): number {
  const cols = process.stdout.columns || 88;
  return Math.max(min, Math.min(max, cols - 4));
}

export function rule(width = termWidth(), label?: string, dashed = false): string {
  const ch = dashed ? "╌" : "─";
  if (!label) {
    return c(PALETTE.border, ch.repeat(Math.max(4, width)));
  }
  const cleanLabel = ` ${label} `;
  const rem = Math.max(4, width - visibleLength(cleanLabel) - 2);
  return `${c(PALETTE.border, ch.repeat(2))}${c(PALETTE.muted, cleanLabel)}${c(PALETTE.border, ch.repeat(rem))}`;
}

export function shortenPath(fullPath: string, maxLen = 46): string {
  const home = os.homedir();
  let display = fullPath;
  if (home && fullPath.toLowerCase().startsWith(home.toLowerCase())) {
    display = `~${fullPath.slice(home.length)}`;
  }
  if (display.length <= maxLen) return display;
  const parts = display.split(/[\\/]/);
  if (parts.length <= 2) return truncatePlain(display, maxLen);
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export type BoxBorderStyle = "round" | "square" | "double" | "dashed";

const BOX_GLYPHS: Record<
  BoxBorderStyle,
  { tl: string; tr: string; bl: string; br: string; h: string; v: string }
> = {
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  square: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  dashed: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "╌", v: "╎" },
};

export interface BoxOptions {
  title?: string;
  rightTitle?: string;
  footer?: string;
  rightFooter?: string;
  width?: number;
  indent?: string;
  borderColor?: string;
  borderStyle?: BoxBorderStyle;
}

/**
 * Renders a crisp box-drawn card (inspired by tooey.design, mdxcn.dev & WebTUI)
 * with exact ANSI-aware alignment and sheared title/footer badges embedded in the borders.
 */
export function renderCard(lines: string[], opts: BoxOptions = {}): string {
  const width = opts.width ?? termWidth(84, 56);
  const indent = opts.indent ?? "  ";
  const bColor = opts.borderColor ?? PALETTE.border;
  const g = BOX_GLYPHS[opts.borderStyle ?? "round"];
  const innerWidth = Math.max(10, width - 4); // "│ " + content + " │"

  // Top border
  let topLine: string;
  if (opts.title || opts.rightTitle) {
    const leftPart = opts.title ? ` ${opts.title} ` : "";
    const rightPart = opts.rightTitle ? ` ${opts.rightTitle} ` : "";
    const fill = Math.max(
      1,
      width - 3 - visibleLength(leftPart) - visibleLength(rightPart) - (rightPart ? 1 : 0),
    );
    topLine =
      `${indent}${c(bColor, `${g.tl}${g.h}`)}${leftPart}${c(bColor, g.h.repeat(fill))}` +
      `${rightPart}${c(bColor, rightPart ? `${g.h}${g.tr}` : g.tr)}`;
  } else {
    topLine = `${indent}${c(bColor, `${g.tl}${g.h.repeat(width - 2)}${g.tr}`)}`;
  }

  const body = lines.map((line) => {
    const clipped = visibleLength(line) > innerWidth ? clipVisible(line, innerWidth) : line;
    const content = padVisible(clipped, innerWidth);
    return `${indent}${c(bColor, g.v)} ${content} ${c(bColor, g.v)}`;
  });

  // Bottom border
  let bottomLine: string;
  if (opts.footer || opts.rightFooter) {
    const leftPart = opts.footer ? ` ${opts.footer} ` : "";
    const rightPart = opts.rightFooter ? ` ${opts.rightFooter} ` : "";
    const fill = Math.max(
      1,
      width - 3 - visibleLength(leftPart) - visibleLength(rightPart) - (rightPart ? 1 : 0),
    );
    bottomLine =
      `${indent}${c(bColor, `${g.bl}${g.h}`)}${leftPart}${c(bColor, g.h.repeat(fill))}` +
      `${rightPart}${c(bColor, rightPart ? `${g.h}${g.br}` : g.br)}`;
  } else {
    bottomLine = `${indent}${c(bColor, `${g.bl}${g.h.repeat(width - 2)}${g.br}`)}`;
  }

  return [topLine, ...body, bottomLine].join("\n");
}
