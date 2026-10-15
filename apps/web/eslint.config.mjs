import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'src/styles/tokens.ts'] },
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Radio/checkbox cards nest their text in <span>s three levels deep.
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either', depth: 3 }],
      // Scrollable tables are labelled role="region" with tabIndex=0 so keyboard users can scroll them (WAI pattern, axe scrollable-region-focusable).
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];

export default config;
