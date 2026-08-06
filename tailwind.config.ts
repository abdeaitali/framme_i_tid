import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17332c",
        pine: "#165b49",
        mint: "#d9f3e7",
        cream: "#fbf8ef",
        sun: "#f6c453",
        coral: "#df715e",
      },
      boxShadow: {
        card: "0 18px 50px rgba(23, 51, 44, 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
