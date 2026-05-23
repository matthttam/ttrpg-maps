import globals from 'globals';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: ['dist/', 'coverage/', '*.config.js', '*.config.mjs', 'vitest.config.ts', 'tests/', 'src/generated/'],
	},
	...obsidianmd.configs.recommended,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
				activeWindow: 'readonly',
				activeDocument: 'readonly',
				createDiv: 'readonly',
				createEl: 'readonly',
				createSpan: 'readonly',
				createSvg: 'readonly',
				createFragment: 'readonly',
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	eslintConfigPrettier,
);
