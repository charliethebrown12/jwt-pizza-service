import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  { languageOptions: { globals: globals.node } },
  { languageOptions: { globals: globals.jest } },
  { languageOptions: { globals: { ...globals.node, ...globals.jest } } },

  // Apply recommended ESLint rules
  pluginJs.configs.recommended,

  // Add custom global variables specifically for your test files
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        request: 'readonly',
        app: 'readonly',
        adminUser: 'readonly',
        dinerUser: 'readonly',
        otherDinerUser: 'readonly',
        adminToken: 'readonly',
        dinerToken: 'readonly',
        otherDinerToken: 'readonly',
        testFranchise: 'writable',
        testStore: 'writable',
        menu: 'writable',
      },
    },
  },
];