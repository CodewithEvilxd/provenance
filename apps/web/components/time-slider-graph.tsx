"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import type { AsOfNode, AsOfEdge } from "@provenance/agents/timeline";

function getNodeBorder(label: string): string {
  if (label === "Decision") return "2px solid var(--gold, #b8860b)";
  if (label === "Incident") return "2px solid var(--rust, #c0392b)";
  if (label === "Commit") return "1px solid #7f8c8d";
  return "1px solid var(--line)";
}

function useFlowLayout(nodes: AsOfNode[], edges: AsOfEdge[]) {
  const displayNodes = useMemo(() => nodes.slice(0, 32), [nodes]);
  const nodeMap = useMemo(
    () => new Set(displayNodes.map((n) => n.id)),
    [displayNodes],
  );

  const flowNodes = useMemo<Node[]>(() => {
    return displayNodes.map((n, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      return {
        id: n.id,
        position: { x: 30 + col * 240, y: 20 + row * 110 },
        data: {
          label: (
            <div style={{ textAlign: "left", fontSize: 11 }}>
              <strong style={{ color: "var(--rust)" }}>{n.label}</strong>
              <div
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                }}
              >
                {n.text || n.id}
              </div>
            </div>
          ),
        },
        style: {
          background: "#fbf9f4",
          border: getNodeBorder(n.label),
          borderRadius: 4,
          padding: "6px 10px",
          width: 200,
        },
      };
    });
  }, [displayNodes]);

  const flowEdges = useMemo<Edge[]>(() => {
    return edges
      .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
      .slice(0, 40)
      .map((e, idx) => ({
        id: `e-${e.from}-${e.type}-${e.to}-${idx}`,
        source: e.from,
        target: e.to,
        label: e.type,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: "#a09c91" },
      }));
  }, [edges, nodeMap]);

  return { flowNodes, flowEdges };
}

function NodeInspector({ node }: { node: AsOfNode }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        background: "#fff",
        border: "1px solid var(--line)",
        padding: "8px 12px",
        borderRadius: 4,
        maxWidth: 320,
        fontSize: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <strong>{node.label} Details</strong>
      <div>ID: {node.id}</div>
      <div>Text: {node.text}</div>
      <div>Valid as of: {node.timestamp || "historical"}</div>
    </div>
  );
}

export function HistoricalGraphView({
  nodes,
  edges,
}: {
  nodes: AsOfNode[];
  edges: AsOfEdge[];
}) {
  const [selectedNode, setSelectedNode] = useState<AsOfNode | null>(null);
  const { flowNodes, flowEdges } = useFlowLayout(nodes, edges);

  return (
    <div style={{ height: 420, position: "relative" }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        onNodeClick={(_, node) => {
          setSelectedNode(nodes.find((n) => n.id === node.id) ?? null);
        }}
      >
        <Background color="#eae6dc" gap={16} />
        <Controls />
      </ReactFlow>
      {selectedNode && <NodeInspector node={selectedNode} />}
    </div>
  );
}
