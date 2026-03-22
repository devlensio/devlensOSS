import { SourceFile, SyntaxKind } from "ts-morph";
import { CodeNode } from "../../types";

function makeId(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function extractStateShape(node: any, storeType: string): string[] {
  const properties: string[] = [];
  const objLiterals = node.getDescendantsOfKind(
    SyntaxKind.ObjectLiteralExpression
  );
  if (objLiterals.length === 0) return properties;

  //Takes the first object literal as the state shape
  // Extracts all property names from that object
  // Example: create((set) => ({ items: [], total: 0 })) → ["items", "total"]
  if (storeType === "zustand") {
    // First object literal is the state shape
    const firstObj = objLiterals[0];
    for (const prop of firstObj.getProperties()) {
      const propName = prop.getName ? prop.getName() : null;
      if (propName) properties.push(propName);
    }
  }


  // Looks for an initialState property within object literals
  // Extracts properties from inside the initialState object
  // Example: createSlice({ initialState: { items: [], total: 0 } }) → ["items", "total"]
  if (storeType === "redux") {
    // Look specifically for initialState object
    for (const obj of objLiterals) {
      for (const prop of obj.getProperties()) {
        const propName = prop.getName ? prop.getName() : null;
        if (propName === "initialState") {
          const initializer = prop.getInitializer();
          if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
          for (const innerProp of initializer.getProperties()) {
            const innerName = innerProp.getName ? innerProp.getName() : null;
            if (innerName) properties.push(innerName);
          }
        }
      }
    }
  }


  //  Looks for a key property and extracts its value as the state identifier
  // Returns the key name (not property names)
  // Example: atom({ key: "cartState", default: { items: [] } }) → ["cartState"]
  if (storeType === "recoil") {
    // Recoil has a single default value not a shape
    // We store the key name as the state identifier
    for (const obj of objLiterals) {
      for (const prop of obj.getProperties()) {
        const propName = prop.getName ? prop.getName() : null;
        if (propName === "key") {
          const initializer = prop.getInitializer
            ? prop.getInitializer()
            : null;
          if (initializer) properties.push(initializer.getText().replace(/['"]/g, ""));
        }
      }
    }
  }

  if (storeType === "jotai") {
    // Jotai atoms don't have a shape
    // We just return empty — the atom name itself is the identifier
    return [];
  }

  return properties;
}



//This function will extract action names from different store types.
function extractActions(node: any, storeType: string): string[] {
  const actions: string[] = [];
  const objLiterals = node.getDescendantsOfKind(
    SyntaxKind.ObjectLiteralExpression
  );


  //  Finds function-valued properties in the first object literal
  // Extracts names of arrow functions and function expressions
  // Example: create((set) => ({ addItem: () => set({ items: [] }) })) → ["addItem"]
  if (storeType === "zustand") {
    // Actions are function-valued properties in the first object
    for (const obj of objLiterals) {
      for (const prop of obj.getProperties()) {
        const initializer = prop.getInitializer
          ? prop.getInitializer()
          : null;
        if (!initializer) continue;
        if (
          initializer.getKind() === SyntaxKind.ArrowFunction ||
          initializer.getKind() === SyntaxKind.FunctionExpression
        ) {
          const name = prop.getName ? prop.getName() : null;
          if (name) actions.push(name);
        }
      }
    }
  }


  //   Looks specifically inside a reducers object
  // Extracts property names from the reducers object
  // Example: createSlice({ reducers: { addItem: (state) => {} } }) → ["addItem"]
  if (storeType === "redux") {
    // Actions live inside the reducers object specifically
    for (const obj of objLiterals) {
      for (const prop of obj.getProperties()) {
        const propName = prop.getName ? prop.getName() : null;
        if (propName === "reducers") {
          const initializer = prop.getInitializer();
          if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
          for (const reducerProp of initializer.getProperties()) {
            const reducerName = reducerProp.getName ? reducerProp.getName() : null;
            if (reducerName) actions.push(reducerName);
          }
        }
      }
    }
  }

  if (storeType === "recoil" || storeType === "jotai") {
    // No actions defined inside atom/selector definitions
    // Actions happen via setters in components
    return [];
  }

  return actions;
}

function detectStoreType(text: string): "zustand" | "redux" | "context" | "recoil" | "jotai" | "unknown" {
  if (text.startsWith("create(") || text.startsWith("create<")) return "zustand";
  if (text.includes("createSlice") || text.includes("createReducer")) return "redux";
  if (text.includes("createContext")) return "context";
  if (text.startsWith("atom(") && text.includes("key:")) return "recoil";
  if (text.startsWith("selector(") || text.startsWith("atomFamily(")) return "recoil";
  if (text.startsWith("atom(") && !text.includes("key:")) return "jotai";
  return "unknown";
}

export function extractStores(file: SourceFile): CodeNode[] {
  const nodes: CodeNode[] = [];
  const filePath = file.getFilePath();

  for (const variable of file.getVariableDeclarations()) {
    const name = variable.getName();
    const initializer = variable.getInitializer();
    if (!initializer) continue;

    const text = initializer.getText();

    // ─── Zustand Store ────────────────────────────────────────────────────────
    // e.g. const useCartStore = create((set) => ({ ... }))
    const isZustand =
      text.startsWith("create(") || text.startsWith("create<");

    // ─── Redux Slice ──────────────────────────────────────────────────────────
    // e.g. const cartSlice = createSlice({ name, initialState, reducers })
    const isRedux =
      text.startsWith("createSlice(") || text.startsWith("createReducer(");

    // ---- Recoil Atom Selector ──────────────────────────────────────────────────────────
    const isRecoil = text.startsWith("atom(") || text.startsWith("selector(") || text.startsWith("atomFamily(") || text.startsWith("selectorFamily(");

    // ----- Jotai Atom ──────────────────────────────────────────────────────────
    const isJotai = text.startsWith("atom(") && !text.includes("key:"); // recoil atoms always have a key property , jotai atoms do not



    // ─── React Context ────────────────────────────────────────────────────────
    // e.g. const AuthContext = createContext(null)
    const isContext =
      text.startsWith("createContext(") ||
      text.startsWith("React.createContext(");

    if (!isZustand && !isRedux && !isContext && !isRecoil && !isJotai) continue;

    const storeType = detectStoreType(text);
    const stateShape = extractStateShape(initializer, storeType);
    const actions = extractActions(initializer, storeType);

    nodes.push({
      id: makeId(filePath, name),
      name,
      type: "STATE_STORE",
      filePath,
      startLine: variable.getStartLineNumber(),
      endLine: variable.getEndLineNumber(),
      rawCode: variable.getText(),
      metadata: {
        storeType,
        stateShape,  // e.g. ["items", "total", "isOpen"]
        actions,     // e.g. ["addItem", "removeItem", "clearCart"]
      },
    });
  }

  return nodes;
}