import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.storage', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Raw string SQL is how injection happens. Use Prisma's query API or tagged-template $queryRaw.
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='$queryRawUnsafe']", message: 'Use parameterized queries ($queryRaw tagged template).' },
        { selector: "CallExpression[callee.property.name='$executeRawUnsafe']", message: 'Use parameterized queries ($executeRaw tagged template).' },
      ],
    },
  },
);
