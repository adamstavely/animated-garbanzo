// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'coverage/**', 'eslint.config.mjs'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'nym', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        // Attribute selectors keep buttons and fields as real elements; both styles
        // are allowed, and both must carry the nym prefix.
        { type: ['element', 'attribute'], prefix: 'nym', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },
  {
    // The root component keeps the conventional app-root selector.
    files: ['src/app/app.ts'],
    rules: { '@angular-eslint/component-selector': 'off' },
  },
  {
    /**
     * Button and icon-button are applied to real `<button>` elements so keyboard
     * activation, disabled semantics and form participation come from the
     * platform. Attribute selectors are camelCase by convention.
     */
    files: ['src/app/ui/button/button.ts', 'src/app/ui/icon-button/icon-button.ts'],
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'attribute', prefix: 'nym', style: 'camelCase' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
);
