import { defineConfig, type Plugin } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json'

/**
 * DataView patch — @mysten/seal@1.1.1 ESM build bug.
 *
 * The ESM version calls `new DataView(uint8Array)` which throws because
 * DataView needs ArrayBuffer, not TypedArray.
 * This Vite plugin injects the fix at the start of every chunk that contains
 * @mysten/seal code.
 */
const DATAVIEW_FIX = `;(function(){var _DV=globalThis.DataView;function PDV(b,o,l){if(b!=null&&!(b instanceof ArrayBuffer)&&!(typeof SharedArrayBuffer!=="undefined"&&b instanceof SharedArrayBuffer)&&b.buffer instanceof ArrayBuffer){var base=(b.byteOffset||0)+(o||0);var size=l!==undefined?l:(b.byteLength-(o||0));return new _DV(b.buffer,base,size);}if(l!==undefined)return new _DV(b,o||0,l);if(o!==undefined)return new _DV(b,o);return new _DV(b);}PDV.prototype=_DV.prototype;try{Object.defineProperty(PDV,"name",{value:"DataView"});}catch(e){}globalThis.DataView=PDV;})();`;

function dataviewPatchPlugin(): Plugin {
  return {
    name: 'dataview-patch',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          chunk.code = DATAVIEW_FIX + '\n' + chunk.code;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    dataviewPatchPlugin(),
  ],
  // No HTML entry — extvault has no popup, only background + content scripts
})
