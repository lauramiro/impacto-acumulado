import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  { ignores: [".next/**", "out/**", "test-results/**", "playwright-report/**"] },
];

export default config;
