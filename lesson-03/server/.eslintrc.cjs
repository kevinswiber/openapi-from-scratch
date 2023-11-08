/* eslint-env node */
module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  root: true,
  rules: {
    "no-unused-vars": {
      argsIgnorePattern: "^_",
    },
    "space-before-function-paren": "off",
  },
};
