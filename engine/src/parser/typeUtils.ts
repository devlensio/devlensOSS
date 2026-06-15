import { SourceFile } from "ts-morph";

export interface ParamInfo {
  name: string;
  type?: string;
}

export function extractParams(node: any): ParamInfo[] {
  const params = node.getParameters ? node.getParameters() : [];
  return params.map((p: any) => ({
    name: p.getName(),
    type: p.getTypeNode()?.getText() ?? undefined,
  }));
}

export function extractReturnTypeAnnotation(node: any): string | undefined {
  return node.getReturnTypeNode?.()?.getText() ?? undefined;
}

// Extract bare PascalCase type names from a set of type annotation strings.
// e.g. ["FetchOptions", "Promise<User>"] → ["FetchOptions", "User"]
export function extractBareTypeNames(typeStrings: (string | undefined)[]): string[] {
  const names: string[] = [];
  for (const t of typeStrings) {
    if (!t) continue;
    for (const m of t.matchAll(/\b([A-Z][A-Za-z0-9_]+)\b/g)) {
      names.push(m[1]);
    }
  }
  return [...new Set(names)];
}

// Looks up interface and type alias declarations in the CURRENT file only (O(1) depth).
// Returns a map of typeName → { propName: propType }.
export function extractReferencedInterfaces(
  sourceFile: SourceFile,
  typeNames: string[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const typeName of typeNames) {
    // Try interface declaration first
    const iface = sourceFile.getInterface(typeName);
    if (iface) {
      const props: Record<string, string> = {};
      for (const prop of iface.getProperties()) {
        props[prop.getName()] = prop.getTypeNode()?.getText() ?? "unknown";
      }
      result[typeName] = props;
      continue;
    }

    // Try type alias
    const alias = sourceFile.getTypeAlias(typeName);
    if (alias) {
      result[typeName] = { _type: alias.getTypeNode()?.getText() ?? "unknown" };
    }
  }

  return result;
}
