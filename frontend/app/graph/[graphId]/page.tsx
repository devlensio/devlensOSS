import { Suspense } from "react";
import GraphView from "./GraphView";

// Static export requires at least one concrete route for a dynamic segment.
// Graph IDs are created at runtime (each analyze), so we can't enumerate them
// at build time. Instead we emit a single placeholder template: the client view
// reads the real graphId from the URL at runtime, and the `bun start` server's
// SPA fallback serves this same app shell for *any* /graph/<id>. So one
// placeholder is enough — arbitrary graph IDs are resolved client-side.
export function generateStaticParams() {
  return [{ graphId: "__devlens__" }];
}

interface Props {
  params: Promise<{ graphId: string }>;
}

export default function GraphPage({ params }: Props) {
  return (
    // GraphView uses useSearchParams() — Next requires a Suspense boundary.
    <Suspense fallback={<div className="p-8 text-sm opacity-70">Loading graph…</div>}>
      <GraphView params={params} />
    </Suspense>
  );
}
