module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
    mocha: true,
  },
  globals: {
    NodeJS: 'readonly',
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**/*'],
  rules: {
    'no-console': 'off', // Allow console in this project
    'prefer-const': 'error',
    'no-var': 'error',
    'no-unused-vars': 'off', // TypeScript handles this
  },
};