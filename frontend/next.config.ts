import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // react-markdown v10 is ESM-only; list it and its direct ESM deps so
  // webpack 5 transpiles them instead of treating them as externals.
  transpilePackages: [
    "react-markdown",
    "remark-gfm",
    "remark-parse",
    "remark-rehype",
    "unified",
    "vfile",
    "devlop",
    "hast-util-to-jsx-runtime",
    "html-url-attributes",
    "mdast-util-to-hast",
    "unist-util-visit",
  ],
};

export default nextConfig;
