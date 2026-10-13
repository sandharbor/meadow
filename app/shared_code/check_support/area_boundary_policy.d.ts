/** Type surface for tooling that reads the same ownership policy as boundary checks. */
export const AREA_CALLERS: Map<string, string>;
export function appAreaSurfaces(appRoot: string): {
  implementationRoots: string[]; implementationFamilies: string[][]; contractRoots: string[]; roots: string[];
};
export function ownership(file: string, roots: string[]): { root?: string; area?: string; caller?: string; interface?: string };
export function canonical(file: string): string;
export function inside(root: string, file: string): boolean;
export function publicName(name: string, typeOnly: boolean, web: boolean): string | null;
export function resolveLocal(fromFile: string, specifier: string): string | null;
