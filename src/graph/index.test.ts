import fs from "fs";
import path from "path";
import os from "os";
import { parseRepo } from "../parser/index";
import { buildLookupMaps } from "./buildLookup";
import { detectCallEdges } from "./edges/callEdges";
import { detectImportEdges } from "./edges/importEdges";
import { detectStateEdges } from "./edges/stateEdges";
import { detectPropEdges } from "./edges/propEdges";
import { detectEventEdges } from "./edges/eventEdges";
import { detectGuardEdges } from "./edges/guardEdges";
import { detectEdges } from "./index";
import { ProjectFingerprint } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createFakeRepo(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "devlens-graph-test-")
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

function makeFingerprint(
  overrides: Partial<ProjectFingerprint> = {}
): ProjectFingerprint {
  return {
    language: "typescript",
    projectType: "frontend",
    framework: "nextjs",
    router: "app",
    stateManagement: ["zustand"],
    dataFetching: ["fetch"],
    databases: [],
    rawDependencies: {},
    ...overrides,
  };
}

// Debug helper — prints all nodes found by parser
// Useful when a test is failing and you want to see what was extracted
function debugNodes(repoPath: string) {
  const { nodes } = parseRepo(repoPath);
  console.log("=== DEBUG NODES ===");
  for (const n of nodes) {
    console.log(`  ${n.type} | ${n.name} | ${n.filePath}`);
  }
  return nodes;
}

// ─── CALLS edges ──────────────────────────────────────────────────────────────

describe("detectCallEdges", () => {

  it("should detect a direct function call", () => {
    const repoPath = createFakeRepo({
      "src/payment.ts": `
        export function processPayment() {
          validateCard();
          chargeCard();
        }
        export function validateCard() { return true; }
        export function chargeCard() { return true; }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectCallEdges(nodes, lookup);

    const callsValidate = edges.find(
      (e) =>
        e.type === "CALLS" &&
        e.from.includes("processPayment") &&
        e.to.includes("validateCard")
    );
    const callsCharge = edges.find(
      (e) =>
        e.type === "CALLS" &&
        e.from.includes("processPayment") &&
        e.to.includes("chargeCard")
    );

    expect(callsValidate).toBeDefined();
    expect(callsCharge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should not create edges for external calls", () => {
    const repoPath = createFakeRepo({
      "src/api.ts": `
        export async function fetchData() {
          const res = await fetch('/api/data');
          console.log(res);
          return res.json();
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectCallEdges(nodes, lookup);

    // fetch and console.log are external — no edges expected
    const externalEdge = edges.find(
      (e) => e.to.includes("fetch") || e.to.includes("console")
    );
    expect(externalEdge).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

  it("should not create self referencing edges", () => {
    const repoPath = createFakeRepo({
      "src/utils.ts": `
        export function factorial(n: number): number {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectCallEdges(nodes, lookup);

    const selfEdge = edges.find((e) => e.from === e.to);
    expect(selfEdge).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

});

// ─── IMPORTS edges ────────────────────────────────────────────────────────────

describe("detectImportEdges", () => {

  it("should detect relative imports between files", () => {
    // Both files in same src/ folder so relative import resolves cleanly
    const repoPath = createFakeRepo({
      "src/CheckoutButton.tsx": `
        import { processPayment } from "./PaymentService";
        export function CheckoutButton() {
          return <button onClick={processPayment}>Pay</button>;
        }
      `,
      "src/PaymentService.ts": `
        export function processPayment() {
          return true;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectImportEdges(lookup, repoPath);

    const importEdge = edges.find(
      (e) =>
        e.type === "IMPORTS" &&
        e.from.includes("CheckoutButton") &&
        e.to.includes("PaymentService")
    );
    expect(importEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should not create edges for third party imports", () => {
    const repoPath = createFakeRepo({
      "src/Component.tsx": `
        import React from "react";
        import axios from "axios";
        export function Component() {
          return <div />;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectImportEdges(lookup, repoPath);

    const thirdPartyEdge = edges.find(
      (e) =>
        e.metadata?.importPath === "react" ||
        e.metadata?.importPath === "axios"
    );
    expect(thirdPartyEdge).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

  it("should not create duplicate edges for multiple imports from same file", () => {
    // Both files in same folder — simple relative imports
    const repoPath = createFakeRepo({
      "src/Checkout.tsx": `
        import { processPayment } from "./PaymentService";
        import { validateCard } from "./PaymentService";
        export function Checkout() {
          return <div />;
        }
      `,
      "src/PaymentService.ts": `
        export function processPayment() { return true; }
        export function validateCard() { return true; }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectImportEdges(lookup, repoPath);

    // Count edges from Checkout to processPayment — should be exactly 1
    const duplicateEdges = edges.filter(
      (e) =>
        e.type === "IMPORTS" &&
        e.from.includes("Checkout") &&
        e.to.includes("PaymentService")
    );
    expect(duplicateEdges.length).toBe(1);
    deleteFakeRepo(repoPath);
  });

});

// ─── STATE edges ──────────────────────────────────────────────────────────────

describe("detectStateEdges", () => {

  it("should detect zustand store usage in a component", () => {
    const repoPath = createFakeRepo({
      "src/store.ts": `
        const useCartStore = create((set) => ({
          items: [],
          addItem: (item) => set((state) => ({
            items: [...state.items, item]
          })),
        }));
      `,
      "src/CheckoutButton.tsx": `
        export function CheckoutButton() {
          const items = useCartStore(state => state.items);
          return <div>{items.length}</div>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectStateEdges(nodes, lookup);

    const readsEdge = edges.find(
      (e) =>
        e.type === "READS_FROM" &&
        e.from.includes("CheckoutButton") &&
        e.to.includes("useCartStore")
    );
    expect(readsEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should detect redux useSelector as READS_FROM", () => {
    const repoPath = createFakeRepo({
      "src/cartSlice.ts": `
        const cartSlice = createSlice({
          name: 'cart',
          initialState: { items: [] },
          reducers: {
            addItem: (state, action) => {
              state.items.push(action.payload);
            },
          }
        });
      `,
      "src/CartPage.tsx": `
        export function CartPage() {
          const items = useSelector(state => state.cart.items);
          return <div>{items.length}</div>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectStateEdges(nodes, lookup);

    const readsEdge = edges.find(
      (e) =>
        e.type === "READS_FROM" &&
        e.from.includes("CartPage") &&
        e.to.includes("cartSlice")
    );
    expect(readsEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should detect redux useDispatch as WRITES_TO", () => {
    const repoPath = createFakeRepo({
      "src/cartSlice.ts": `
        const cartSlice = createSlice({
          name: 'cart',
          initialState: { items: [] },
          reducers: {
            addItem: (state, action) => {
              state.items.push(action.payload);
            },
          }
        });
      `,
      "src/AddToCart.tsx": `
        export function AddToCart() {
          const dispatch = useDispatch();
          return <button onClick={() => dispatch(addItem())}>Add</button>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectStateEdges(nodes, lookup);

    const writesEdge = edges.find(
      (e) =>
        e.type === "WRITES_TO" &&
        e.from.includes("AddToCart") &&
        e.to.includes("cartSlice")
    );
    expect(writesEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

});

// ─── PROP_PASS edges ──────────────────────────────────────────────────────────

describe("detectPropEdges", () => {

  it("should detect prop passing from parent to child", () => {
    const repoPath = createFakeRepo({
      "src/OrderSummary.tsx": `
        export function OrderSummary() {
          const item = { name: "Product" };
          return <CartItem item={item} />;
        }
      `,
      "src/CartItem.tsx": `
        export function CartItem({ item }) {
          return <div>{item.name}</div>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectPropEdges(nodes, lookup, repoPath);

    const propEdge = edges.find(
      (e) =>
        e.type === "PROP_PASS" &&
        e.from.includes("OrderSummary") &&
        e.to.includes("CartItem")
    );
    expect(propEdge).toBeDefined();
    expect(propEdge?.metadata?.props).toContain("item");
    deleteFakeRepo(repoPath);
  });

  it("should track renderCount when same child rendered multiple times", () => {
    const repoPath = createFakeRepo({
      "src/ProductList.tsx": `
        export function ProductList() {
          return (
            <div>
              <ProductCard product={products[0]} />
              <ProductCard product={products[1]} />
              <ProductCard product={products[2]} />
            </div>
          );
        }
      `,
      "src/ProductCard.tsx": `
        export function ProductCard({ product }) {
          return <div>{product.name}</div>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);

    // Only pass ProductList node — not ProductCard
    // ProductCard doesn't render any JSX children so it won't
    // create any PROP_PASS edges anyway, but filtering here
    // ensures renderCount is only counted from ProductList's body
    const productListOnly = nodes.filter(
      (n) => n.name === "ProductList"
    );

    const lookup = buildLookupMaps(nodes); // full lookup so ProductCard is findable
    const edges = detectPropEdges(productListOnly, lookup, repoPath);

    const propEdge = edges.find(
      (e) =>
        e.type === "PROP_PASS" &&
        e.from.includes("ProductList") &&
        e.to.includes("ProductCard")
    );
    expect(propEdge?.metadata?.renderCount).toBe(3);
    deleteFakeRepo(repoPath);
  });

  it("should skip HTML native elements", () => {
    const repoPath = createFakeRepo({
      "src/Form.tsx": `
        export function Form() {
          return (
            <div>
              <input type="text" />
              <button>Submit</button>
            </div>
          );
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const edges = detectPropEdges(nodes, lookup, repoPath);

    const nativeEdge = edges.find(
      (e) =>
        e.to.includes("input") ||
        e.to.includes("button") ||
        e.to.includes("div")
    );
    expect(nativeEdge).toBeUndefined();
    deleteFakeRepo(repoPath);
  });

});

// ─── EVENT edges ──────────────────────────────────────────────────────────────

describe("detectEventEdges", () => {

  it("should detect custom event emitter and create ghost node", () => {
    const repoPath = createFakeRepo({
      "src/payment.ts": `
        export function processPayment() {
          window.dispatchEvent(new CustomEvent('payment-complete'));
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const result = detectEventEdges(lookup, repoPath);

    const emitEdge = result.edges.find(
      (e) =>
        e.type === "EMITS" &&
        e.from.includes("processPayment")
    );
    const ghostNode = result.ghostNodes.find(
      (n) => n.name === "event:payment-complete"
    );

    expect(emitEdge).toBeDefined();
    expect(ghostNode).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should detect event listener", () => {
    const repoPath = createFakeRepo({
      "src/notifications.ts": `
        export function setupListeners() {
          window.addEventListener('payment-complete', showConfirmation);
        }
        export function showConfirmation() {
          console.log('Payment complete');
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const result = detectEventEdges(lookup, repoPath);

    const listenEdge = result.edges.find(
      (e) =>
        e.type === "LISTENS" &&
        e.to.includes("setupListeners")
    );
    expect(listenEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should reuse ghost node for same event name", () => {
    const repoPath = createFakeRepo({
      "src/payment.ts": `
        export function processPayment() {
          window.dispatchEvent(new CustomEvent('payment-complete'));
        }
        export function setupListeners() {
          window.addEventListener('payment-complete', handlePayment);
        }
        export function handlePayment() {}
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const result = detectEventEdges(lookup, repoPath);

    const ghostNodes = result.ghostNodes.filter(
      (n) => n.name === "event:payment-complete"
    );
    // Same event name → exactly one ghost node
    expect(ghostNodes.length).toBe(1);
    deleteFakeRepo(repoPath);
  });

});

// ─── GUARDS edges ─────────────────────────────────────────────────────────────

describe("detectGuardEdges", () => {

  it("should detect Next.js middleware guards", () => {
    const repoPath = createFakeRepo({
      "middleware.ts": `
        import { NextRequest, NextResponse } from "next/server";

        export function middleware(request: NextRequest) {
          return NextResponse.next();
        }

        export const config = {
          matcher: ['/dashboard/:path*', '/admin/:path*']
        };
      `,
      "app/dashboard/page.tsx": `
        export default function DashboardPage() {
          return <div>Dashboard</div>;
        }
      `,
      "app/admin/page.tsx": `
        export default function AdminPage() {
          return <div>Admin</div>;
        }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const fingerprint = makeFingerprint({ framework: "nextjs" });

    const routeNodes = [
      {
        type: "PAGE" as const,
        urlPath: "/dashboard",
        filePath: path.join(repoPath, "app/dashboard/page.tsx"),
        isDynamic: false,
        isCatchAll: false,
        isGroupRoute: false,
      },
      {
        type: "PAGE" as const,
        urlPath: "/admin",
        filePath: path.join(repoPath, "app/admin/page.tsx"),
        isDynamic: false,
        isCatchAll: false,
        isGroupRoute: false,
      },
    ];

    const edges = detectGuardEdges(nodes, lookup, routeNodes, repoPath, fingerprint);

    const guardsDashboard = edges.find(
      (e) => e.type === "GUARDS" && e.to === "/dashboard"
    );
    const guardsAdmin = edges.find(
      (e) => e.type === "GUARDS" && e.to === "/admin"
    );

    expect(guardsDashboard).toBeDefined();
    expect(guardsAdmin).toBeDefined();
    deleteFakeRepo(repoPath);
  });

  it("should detect Express middleware guards", () => {
    const repoPath = createFakeRepo({
      "src/server.ts": `
        import express from 'express';
        const app = express();

        export function requireAdmin(req: any, res: any, next: any) {
          next();
        }

        app.use('/admin', requireAdmin);
        app.get('/admin/users', getUsers);
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const lookup = buildLookupMaps(nodes);
    const fingerprint = makeFingerprint({
      framework: "express",
      projectType: "backend",
      router: "none",
      stateManagement: [],
      dataFetching: [],
    });

    const routeNodes = [
      {
        type: "BACKEND_ROUTE" as const,
        urlPath: "/admin/users",
        filePath: path.join(repoPath, "src/server.ts"),
        httpMethod: "GET" as const,
        framework: "express" as const,
        isDynamic: false,
        handlerName: "getUsers",
        params: [],
      },
    ];

    const edges = detectGuardEdges(nodes, lookup, routeNodes, repoPath, fingerprint);

    const guardsAdmin = edges.find(
      (e) => e.type === "GUARDS" && e.to === "/admin/users"
    );
    expect(guardsAdmin).toBeDefined();
    deleteFakeRepo(repoPath);
  });

});

// ─── Full pipeline ────────────────────────────────────────────────────────────

describe("detectEdges", () => {

  it("should return edges and ghost nodes from full pipeline", () => {
    const repoPath = createFakeRepo({
      "src/payment.ts": `
        export function processPayment() {
          validateCard();
        }
        export function validateCard() { return true; }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const fingerprint = makeFingerprint();
    const result = detectEdges(nodes, [], repoPath, fingerprint);

    expect(result.edges).toBeDefined();
    expect(result.ghostNodes).toBeDefined();
    expect(Array.isArray(result.edges)).toBe(true);
    expect(Array.isArray(result.ghostNodes)).toBe(true);
    deleteFakeRepo(repoPath);
  });

  it("should detect calls edges in full pipeline", () => {
    const repoPath = createFakeRepo({
      "src/payment.ts": `
        export function processPayment() {
          validateCard();
        }
        export function validateCard() { return true; }
      `,
    });

    const { nodes } = parseRepo(repoPath);
    const fingerprint = makeFingerprint();
    const result = detectEdges(nodes, [], repoPath, fingerprint);

    const callEdge = result.edges.find(
      (e) =>
        e.type === "CALLS" &&
        e.from.includes("processPayment") &&
        e.to.includes("validateCard")
    );
    expect(callEdge).toBeDefined();
    deleteFakeRepo(repoPath);
  });

});