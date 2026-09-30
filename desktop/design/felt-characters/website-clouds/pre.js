// Simeon's felt clouds on simeonlabs.com (public/clouds.js, written by build.py from this folder).
//
// The character is the approved felt "flower cloud" (Simeon Forms, three.js 0.170.0): a_utils.js,
// b_mesh.js, c_glsl.js, d_markdata.js and d_engine.js are its parts as approved, unchanged; e_felt.js is
// its main.js up to the render function (form, fur, bead eyes, the app's states and their effects),
// with the page's own canvas, UI and loop left out. site.js places a few clouds around the page
// and draws them all with the one renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const Q = new URLSearchParams(); // the forms page's query knobs: none on the site
const qnum = (k, d) => d;
const KNOBS = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  shadowSize: 1024,          // the forms page: 2048, for a cloud filling the screen
  shortSegments: 3,
  longSegments: 10,
  cell: 0.02,
  furLen: 0.056,
  // Half the forms page's coat and fly-aways are grown (it is only ever drawn small here); the tiers are doubled to
  // match, so each size draws exactly as many strands, as wide, as the forms page does at that size.
  budget: { coat: 24000, fly: 1300, lidCoat: 2000, lowerLid: 450, pom: 2600 },
  tiers: [
    { name: 'large', minPx: 330, frac: 1.0 },
    { name: 'medium', minPx: 160, frac: 0.44 },
    { name: 'small', minPx: 70, frac: 0.16 },
    { name: 'tiny', minPx: 0, frac: 0.06 },
  ],
};
