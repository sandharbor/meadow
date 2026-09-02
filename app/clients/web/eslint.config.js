import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**/*', 'shared_components/**/*']
  },
  {
    files: ['server.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      'no-undef': 'off'
    }
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.node.json',
      },
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        sessionStorage: 'readonly',
        EventSource: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/react-in-jsx-scope': 'off',
      'no-restricted-globals': ['error', {
        name: 'fetch',
        message: 'Use apiRequest, apiJson, or resourceRequest from shared/utils/apiClient.'
      }],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-router-dom',
          importNames: ['Link', 'NavLink', 'Navigate', 'useNavigate'],
          message: 'Use useAppNavigation from shared/utils/appNavigation for internal app navigation.'
        }]
      }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.object.name='window'][left.property.name='location']",
          message: 'Use useAppNavigation for internal routes or openExternal for external URLs.'
        },
        {
          selector: "AssignmentExpression[left.object.object.name='window'][left.object.property.name='location']",
          message: 'Use useAppNavigation for internal routes or openExternal for external URLs.'
        },
        {
          selector: "AssignmentExpression[left.name='location'], AssignmentExpression[left.object.name='location']",
          message: 'Use useAppNavigation for internal routes or openExternal for external URLs.'
        },
        {
          selector: "CallExpression[callee.object.object.name='window'][callee.object.property.name='location'], CallExpression[callee.object.name='location']",
          message: 'Use useAppNavigation for internal routes or openExternal for external URLs.'
        },
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='open']",
          message: 'Use openExternal from shared/utils/openExternal for external URLs.'
        },
        {
          selector: "CallExpression[callee.object.object.name='window'][callee.object.property.name='history'], CallExpression[callee.object.name='history']",
          message: 'Use useAppNavigation from shared/utils/appNavigation for internal app navigation.'
        }
      ],
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    }
  },
  {
    files: ['src/shared/utils/appNavigation.ts'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['src/shared/utils/openExternal.ts'],
    rules: {
      'no-restricted-syntax': 'off'
    }
  },
  {
    files: ['test/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLInputElement: 'readonly',
        sessionStorage: 'readonly',
        EventSource: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        vi: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescript,
      'react': react,
      'react-hooks': reactHooks
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    }
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        vi: 'readonly'
      }
    }
  }
]; 
