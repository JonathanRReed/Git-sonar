import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
    {
        ignores: ["dist/**", ".astro/**", "node_modules/**"],
    },
    js.configs.recommended,
    ...tsPlugin.configs["flat/recommended"],
    reactHooksPlugin.configs.flat.recommended,
    {
        files: ["src/**/*.{ts,tsx}"],
        plugins: {
            react: reactPlugin,
        },
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "module",
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
            "no-unused-vars": "off",
            "no-undef": "off",
            "no-console": ["warn", { allow: ["warn", "error"] }],
        },
    },
];
