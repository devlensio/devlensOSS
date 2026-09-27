// vendor.d.ts
//
// Type declarations for the two search dependencies that ship without their
// own TypeScript definitions. Everything else in src/search is fully typed.

declare module "stopword" {
  export const eng: string[];
  export function removeStopwords(
    tokens: string[],
    stopwordLists?: string[][]
  ): string[];
}

declare module "wink-porter2-stemmer" {
  function stem(token: string): string;
  export default stem;
}
