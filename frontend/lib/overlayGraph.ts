import { useState } from "react";
import { EdgeType, NodeType, OverlayGraph } from "./types";
import { DEFAULT_EDGE_TYPES, DEFAULT_NODE_TYPES } from "@/components/graph/cytoscapeConfig";

export function useOverlayGraph() {
    const [overlayStack, setOverlayStack] = useState<OverlayGraph[]>([]);
    const current = overlayStack[overlayStack.length - 1] ?? null;
    const isOpen = overlayStack.length > 0;

    function open(nodeId: string, nodeType?: NodeType, currentFilters?: {
        activeNodeTypes: NodeType[];
        activeEdgeTypes: EdgeType[];
    }) {
        const activeNodeTypes = currentFilters?.activeNodeTypes
        ? [...currentFilters.activeNodeTypes]
        : [...DEFAULT_NODE_TYPES];
        
        // Always ensure root node type is visible
        if (nodeType && !activeNodeTypes.includes(nodeType)) {
            activeNodeTypes.push(nodeType);
        }
        
        const activeEdgeTypes = currentFilters?.activeEdgeTypes
        ? [...currentFilters.activeEdgeTypes]
        : [...DEFAULT_EDGE_TYPES];
        
        console.log("Active Node and Edges", currentFilters, activeNodeTypes.join(", "), activeEdgeTypes.join(", "));
        setOverlayStack([{
            rootNodeId: nodeId,
            activeNodeTypes,
            activeEdgeTypes,
            mode: "full",
        }]);
    }

    function navigate(nodeId: string, nodeType?: NodeType) {
        setOverlayStack(prev => {
            // Start with current filters so user doesn't lose their filter state
            const currentEntry = prev[prev.length - 1];
            if(currentEntry.rootNodeId === nodeId){
                return prev; // no need to navigate if clicking on the same node
            }
            const activeNodeTypes = currentEntry
                ? [...currentEntry.activeNodeTypes]
                : [...DEFAULT_NODE_TYPES];

            // Ensure the target node's type is always visible
            if (nodeType && !activeNodeTypes.includes(nodeType)) {
                activeNodeTypes.push(nodeType);
            }

            return [...prev, {
                rootNodeId: nodeId,
                activeNodeTypes,
                activeEdgeTypes: currentEntry
                    ? currentEntry.activeEdgeTypes
                    : [...DEFAULT_EDGE_TYPES],
                mode: "full",
            }];
        });
    }

    function back() {
        setOverlayStack(prev => prev.slice(0, -1));
    }

    function close() {
        setOverlayStack([]);
    }

    function updateFilters(updates: Partial<OverlayGraph>) {
        setOverlayStack(prev => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], ...updates };
            return next;
        });
    }


    return {
        overlayStack,
        current,
        isOpen,
        open,
        navigate,
        back,
        close,
        updateFilters,
    }
}