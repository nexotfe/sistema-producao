import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
