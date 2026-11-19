"use client";

import { useEffect, useState } from "react";
import type { EdgeType, NodeType } from "@/lib/types";
import {
  EDGE_COLORS,
  EDGE_TYPES,
  NODE_COLORS,
  NODE_TYPES,
} from "./cytoscapeConfig";
import FilterDropdown from "./FilterDropdown";

interface OverlayFilterBarProps {
  activeNodeTypes: NodeType[];
  activeEdgeTypes: EdgeType[];
  onApply: (nodeTypes: NodeType[], edgeTypes: EdgeType[]) => void;
}

export default function OverlayFilterBar({
  activeNodeTypes,
  activeEdgeTypes,
  onApply,
}: OverlayFilterBarProps) {
  const [draftNodes, setDraftNodes] = useState<NodeType[]>(() => [
    ...activeNodeTypes,
  ]);
  const [draftEdges, setDraftEdges] = useState<EdgeType[]>(() => [
    ...activeEdgeTypes,
  ]);

  // Sync drafts when committed values change from outside (e.g. overlay navigation)
  useEffect(() => {
    setDraftNodes([...activeNodeTypes]);
  }, [activeNodeTypes]);
  useEffect(() => {
    setDraftEdges([...activeEdgeTypes]);
  }, [activeEdgeTypes]);

  const isDirty =
    draftNodes.length !== activeNodeTypes.length ||
    draftNodes.some((t) => !activeNodeTypes.includes(t)) ||
    draftEdges.length !== activeEdgeTypes.length ||
    draftEdges.some((t) => !activeEdgeTypes.includes(t));

  function handleApply() {
    onApply(draftNodes, draftEdges);
  }

  return (
    <div className="flex items-center gap-2">
      <FilterDropdown
        label="Nodes"
        options={NODE_TYPES}
        active={draftNodes}
        colors={NODE_COLORS}
        onChange={setDraftNodes}
      />

      <FilterDropdown
        label="Edges"
        options={EDGE_TYPES}
        active={draftEdges}
        colors={EDGE_COLORS}
        onChange={setDraftEdges}
      />

      {isDirty && (
        <button
          onClick={handleApply}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     font-semibold transition-all shrink-0"
          
          style={{
            background: "rgba(14,118,110,0.10)",
            border: "1px solid rgba(14,118,110,0.32)",
            color: "#0e766e",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(14,118,110,0.22)";
            el.style.borderColor = "#0e766e";
            el.style.animationName = "none";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(14,118,110,0.10)";
            el.style.borderColor = "rgba(14,118,110,0.32)";
            el.style.animationName = "";
          }}
        >
          Apply
        </button>
      )}

      {/* Reset to full subgraph — only shown when external nodes are set */}
      {/* {current.externalNodeIds && current.externalNodeIds.length > 0 && (
        <button
          onClick={() => onUpdateFilters({ externalNodeIds: undefined })}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
               transition-colors shrink-0"
          style={{
            background: "rgba(14,118,110,0.06)",
            color: "#0e766e",
            border: "1px solid rgba(14,118,110,0.22)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(14,118,110,0.10)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(14,118,110,0.06)")}
        >
          ↺ Full subgraph
        </button>
      )} */}
    </div>
  );
}
