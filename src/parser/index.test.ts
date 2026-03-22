import fs from "fs";
import path from "path";
import os from "os";
import { parseRepo } from "./index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createFakeRepo(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "devlens-parser-test-")
  );
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

function deleteFakeRepo(repoPath: string): void {
  fs.rmSync(repoPath, { recursive: true, force: true });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseRepo", () => {

  // ─── Component Detection ───────────────────────────────────────────────────

  it("should detect a function declaration component", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `
        export function Button() {
          return <button>Click me</button>;
        }
      `,
    });
    const result = parseRepo(repoPath);
    const component = result.nodes.find((n) => n.name === "Button");
    expect(component).toBeDefined();
    expect(component?.type).toBe("COMPONENT");
    deleteFakeRepo(repoPath);
  });

  it("should detect an arrow function component", () => {
    const repoPath = createFakeRepo({
      "src/Card.tsx": `
        export const Card = () => {
          return <div>Card</div>;
        };
      `,
    });
    const result = parseRepo(repoPath);
    const component = result.nodes.find((n) => n.name === "Card");
    expect(component).toBeDefined();
    expect(component?.type).toBe("COMPONENT");
    deleteFakeRepo(repoPath);
  });

  it("should detect hooks in component metadata", () => {
    const repoPath = createFakeRepo({
      "src/Counter.tsx": `
        import { useState } from "react";
        export function Counter() {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        }
      `,
    });
    const result = parseRepo(repoPath);
    const component = result.nodes.find((n) => n.name === "Counter");
    expect(component?.metadata.hasState).toBe(true);
    expect(component?.metadata.hooks).toContain("useState");
    deleteFakeRepo(repoPath);
  });

  it("should not detect lowercase functions as components", () => {
    const repoPath = createFakeRepo({
      "src/utils.tsx": `
        export function formatDate() {
          return <div>not a component</div>;
        }
      `,
    });
    const result = parseRepo(repoPath);
    const node = result.nodes.find((n) => n.name === "formatDate");
    expect(node?.type).not.toBe("COMPONENT");
    deleteFakeRepo(repoPath);
  });

  it("should detect React.memo wrapped component", () => {
    const repoPath = createFakeRepo({
      "src/MemoCard.tsx": `
        export const MemoCard = React.memo(() => {
          return <div>Memo</div>;
        });
      `,
    });
    const result = parseRepo(repoPath);
    const component = result.nodes.find((n) => n.name === "MemoCard");
    expect(component).toBeDefined();
    expect(component?.metadata.isMemoized).toBe(true);
    deleteFakeRepo(repoPath);
  });

  // ─── Hook Detection ────────────────────────────────────────────────────────

  it("should detect a custom hook", () => {
    const repoPath = createFakeRepo({
      "src/useAuth.ts": `
        export function useAuth() {
          const [user, setUser] = useState(null);
          return { user };
        }
      `,
    });
    const result = parseRepo(repoPath);
    const hook = result.nodes.find((n) => n.name === "useAuth");
    expect(hook).toBeDefined();
    expect(hook?.type).toBe("HOOK");
    deleteFakeRepo(repoPath);
  });

  it("should not create a HOOK node for built-in hooks", () => {
    const repoPath = createFakeRepo({
      "src/Component.tsx": `
        export function MyComponent() {
          const [x] = useState(0);
          return <div>{x}</div>;
        }
      `,
    });
    const result = parseRepo(repoPath);
    const hook = result.nodes.find(
      (n) => n.name === "useState" && n.type === "HOOK"
    );
    expect(hook).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

  it("should detect async custom hook", () => {
    const repoPath = createFakeRepo({
      "src/useData.ts": `
        export async function useData() {
          const data = await fetch('/api/data');
          return data.json();
        }
      `,
    });
    const result = parseRepo(repoPath);
    const hook = result.nodes.find((n) => n.name === "useData");
    expect(hook?.metadata.isAsync).toBe(true);
    deleteFakeRepo(repoPath);
  });

  // ─── Function Detection ────────────────────────────────────────────────────

  it("should detect a regular function", () => {
    const repoPath = createFakeRepo({
      "src/utils.ts": `
        export function calculateTotal(items: any[]) {
          return items.reduce((sum, item) => sum + item.price, 0);
        }
      `,
    });
    const result = parseRepo(repoPath);
    const fn = result.nodes.find((n) => n.name === "calculateTotal");
    expect(fn).toBeDefined();
    expect(fn?.type).toBe("FUNCTION");
    deleteFakeRepo(repoPath);
  });

  it("should detect async functions", () => {
    const repoPath = createFakeRepo({
      "src/api.ts": `
        export async function fetchUser(id: string) {
          const res = await fetch('/api/users/' + id);
          return res.json();
        }
      `,
    });
    const result = parseRepo(repoPath);
    const fn = result.nodes.find((n) => n.name === "fetchUser");
    expect(fn?.metadata.isAsync).toBe(true);
    deleteFakeRepo(repoPath);
  });

  it("should detect fetch api calls inside functions", () => {
    const repoPath = createFakeRepo({
      "src/api.ts": `
        export async function getProducts() {
          const res = await fetch('/api/products');
          return res.json();
        }
      `,
    });
    const result = parseRepo(repoPath);
    const fn = result.nodes.find((n) => n.name === "getProducts");
    expect((fn?.metadata.apiCalls as string[]).length).toBeGreaterThan(0);
    deleteFakeRepo(repoPath);
  });

  it("should detect error handling in functions", () => {
    const repoPath = createFakeRepo({
      "src/api.ts": `
        export async function safeRequest() {
          try {
            const res = await fetch('/api/data');
            return res.json();
          } catch (error) {
            console.error(error);
          }
        }
      `,
    });
    const result = parseRepo(repoPath);
    const fn = result.nodes.find((n) => n.name === "safeRequest");
    expect(fn?.metadata.hasErrorHandling).toBe(true);
    deleteFakeRepo(repoPath);
  });

  // ─── Store Detection ───────────────────────────────────────────────────────

  it("should detect a zustand store", () => {
    const repoPath = createFakeRepo({
      "src/store.ts": `
        const useCartStore = create((set) => ({
          items: [],
          addItem: (item) => set((state) => ({ items: [...state.items, item] })),
        }));
      `,
    });
    const result = parseRepo(repoPath);
    const store = result.nodes.find((n) => n.name === "useCartStore");
    expect(store).toBeDefined();
    expect(store?.type).toBe("STATE_STORE");
    expect(store?.metadata.storeType).toBe("zustand");
    deleteFakeRepo(repoPath);
  });

  it("should detect zustand state shape and actions", () => {
    const repoPath = createFakeRepo({
      "src/store.ts": `
        const useCartStore = create((set) => ({
          items: [],
          total: 0,
          addItem: (item) => set((state) => ({ items: [...state.items, item] })),
          clearCart: () => set({ items: [], total: 0 }),
        }));
      `,
    });
    const result = parseRepo(repoPath);
    const store = result.nodes.find((n) => n.name === "useCartStore");
    expect(store?.metadata.stateShape).toContain("items");
    expect(store?.metadata.stateShape).toContain("total");
    expect(store?.metadata.actions).toContain("addItem");
    expect(store?.metadata.actions).toContain("clearCart");
    deleteFakeRepo(repoPath);
  });

  it("should detect a redux slice", () => {
    const repoPath = createFakeRepo({
      "src/cartSlice.ts": `
        const cartSlice = createSlice({
          name: 'cart',
          initialState: { items: [], total: 0 },
          reducers: {
            addItem: (state, action) => { state.items.push(action.payload); },
            clearCart: (state) => { state.items = []; },
          }
        });
      `,
    });
    const result = parseRepo(repoPath);
    const store = result.nodes.find((n) => n.name === "cartSlice");
    expect(store).toBeDefined();
    expect(store?.type).toBe("STATE_STORE");
    expect(store?.metadata.storeType).toBe("redux");
    expect(store?.metadata.actions).toContain("addItem");
    expect(store?.metadata.actions).toContain("clearCart");
    deleteFakeRepo(repoPath);
  });

  it("should detect a react context store", () => {
    const repoPath = createFakeRepo({
      "src/AuthContext.ts": `
        const AuthContext = createContext(null);
      `,
    });
    const result = parseRepo(repoPath);
    const store = result.nodes.find((n) => n.name === "AuthContext");
    expect(store).toBeDefined();
    expect(store?.type).toBe("STATE_STORE");
    expect(store?.metadata.storeType).toBe("context");
    deleteFakeRepo(repoPath);
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  it("should return correct file count in stats", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `export function Button() { return <button />; }`,
      "src/useAuth.ts": `export function useAuth() { return {}; }`,
      "src/utils.ts": `export function formatDate() { return ''; }`,
    });
    const result = parseRepo(repoPath);
    expect(result.stats.totalFiles).toBe(3);
    deleteFakeRepo(repoPath);
  });

  it("should count components correctly in stats", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `export function Button() { return <button />; }`,
      "src/Card.tsx": `export function Card() { return <div />; }`,
    });
    const result = parseRepo(repoPath);
    expect(result.stats.componentCount).toBe(2);
    deleteFakeRepo(repoPath);
  });

  // ─── Noise Filtering ───────────────────────────────────────────────────────

  it("should ignore node_modules", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `export function Button() { return <button />; }`,
      "node_modules/react/index.js": `export function useState() {}`,
    });
    const result = parseRepo(repoPath);
    const nodeModuleNode = result.nodes.find((n) =>
      n.filePath.includes("node_modules")
    );
    expect(nodeModuleNode).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

  it("should ignore test files", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `export function Button() { return <button />; }`,
      "src/Button.test.tsx": `export function FakeButton() { return <button />; }`,
    });
    const result = parseRepo(repoPath);
    const testNode = result.nodes.find((n) => n.filePath.includes(".test."));
    expect(testNode).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

  it("should ignore config files", () => {
    const repoPath = createFakeRepo({
      "src/Button.tsx": `export function Button() { return <button />; }`,
      "next.config.ts": `export default {};`,
    });
    const result = parseRepo(repoPath);
    const configNode = result.nodes.find((n) =>
      n.filePath.includes(".config.")
    );
    expect(configNode).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

});