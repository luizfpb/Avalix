import js from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores(["dist", "scripts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // Componentes shadcn exportam variants junto do componente; a regra do
    // react-refresh nao se aplica a essa pasta.
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // permite descartar campos com prefixo _ (ex.: const { compute: _c, ...meta })
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // assessmentPdf mistura o gerador de PDF com componentes @react-pdf (nao sao
    // componentes DOM); fast-refresh nao se aplica.
    files: ["src/features/reports/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
])
