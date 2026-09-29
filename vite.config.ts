import { defineConfig } from "vite";

export default defineConfig({
  base: "/MG-AFK-CloudflareMobileController/",
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.ts"],
  },
});
