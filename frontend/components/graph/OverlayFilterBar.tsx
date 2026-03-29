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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     font-semibold transition-all shrink-0 animate-pulse"
          style={{
            background: "#2dd4bf20",
            border: "1px solid #2dd4bf50",
            color: "#2dd4bf",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#2dd4bf30";
            el.style.borderColor = "#2dd4bf";
            el.style.animationName = "none";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "#2dd4bf20";
            el.style.borderColor = "#2dd4bf50";
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
            background: "#2dd4bf12",
            color: "#2dd4bf",
            border: "1px solid #2dd4bf30",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2dd4bf20")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#2dd4bf12")}
        >
          ↺ Full subgraph
        </button>
      )} */}
    </div>
  );
}
