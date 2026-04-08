import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
	{
		ignores: ['dist/', 'coverage/', '*.config.js', '*.config.mjs', 'tests/', 'src/generated/'],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: {
			...obsidianmd.configs.recommended,
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'no-restricted-globals': ['error', 'confirm'],
		},
	},
	eslintConfigPrettier,
];
