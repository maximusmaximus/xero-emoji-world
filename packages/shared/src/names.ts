import { Rng } from './rng.js';

const FIRST = ['Ada','Bo','Cai','Dara','Eli','Fen','Gia','Hiro','Ines','Juno','Kai','Lumi','Mara','Nico','Oona','Pax','Quin','Rhea','Sol','Tavi','Uma','Vik','Wren','Xero','Yara','Zed','Amara','Bram','Cleo','Dex','Esme','Femi','Gus','Hana','Ivo','Jade','Kofi','Lea','Milo','Nia','Omar','Pia','Remy','Sana','Teo','Ugo','Vera','Wim','Yuki','Zuri'];
const LAST = ['Okafor','Lindqvist','Tanaka','Moreau','Silva','Novak','Haddad','Kowalski','Nguyen','Ibarra','Achebe','Petrov','Rossi','Kim','Patel','Osei','Mendes','Fischer','Sato','Ward','Quispe','Abara','Lund','Hale','Zhou','Emoji'];
const DISTRICT_A = ['Neon','Glyph','Pixel','Unicode','Sparkle','Zero','Halo','Prism','Echo','Nova','Copper','Velvet','Lantern','Harbor','Orchid','Cobalt','Sunset','Ember'];
const DISTRICT_B = ['Heights','Quarter','Docks','Gardens','Row','Commons','Spire','Flats','Terrace','Market','Yards','Village','Park','Point','Junction','Bay'];
const BUILDING_A = ['Xero','Grand','Sky','Iris','Atlas','Juniper','Meridian','Aurora','Beacon','Crescent','Vertex','Haven','Tidal','Lumen','Granite'];
const BUILDING_B = ['Tower','House','Plaza','Court','Lofts','Arms','Residences','Building','Center','Exchange','Hall','Works'];

export const personName = (r: Rng) => `${r.pick(FIRST)} ${r.pick(LAST)}`;
export const petName = (r: Rng) => r.pick(['Biscuit','Mochi','Pixel','Noodle','Ziggy','Pepper','Luna','Taco','Bean','Glitch','Sprout','Unicorn']);
export const districtName = (r: Rng) => `${r.pick(DISTRICT_A)} ${r.pick(DISTRICT_B)}`;
export const buildingName = (r: Rng) => `${r.pick(BUILDING_A)} ${r.pick(BUILDING_B)}`;
