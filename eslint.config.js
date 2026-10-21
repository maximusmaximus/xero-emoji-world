import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['prototype/**', '**/dist/**', '**/node_modules/**', 'data/**', 'backups/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
