/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { Config } from 'tailwindcss';
import { palettes, semanticButtonsForTailwind } from '../shared_code/design/colors';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /(bg|text|border)-(main|neutral|danger|warning|success|info)-(50|100|200|300|400|500|600|700|800|900|950)/,
    },
    {
      pattern: /(bg|text|border|ring)-(btn-standard|btn-confirm|btn-cancel|btn-danger)-(normal|hover|text)/,
    },
  ],
  theme: {
    extend: {
      colors: {
        // Import all palette colors from shared config
        ...palettes,
        // Import semantic button colors from shared config
        ...semanticButtonsForTailwind,
      },
    },
  },
  plugins: [],
} satisfies Config;
