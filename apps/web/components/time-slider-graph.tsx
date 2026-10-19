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

function getLabelChipClass(label: string): string {
  if (label === "Decision") return "chip-violet";
  if (label === "Incident") return "chip-pink";
  if (label === "Commit") return "chip-lime";
  return "chip-paper";
}

function createFlowNode(n: AsOfNode, idx: number): Node {
  const col = idx % 4;
  const row = Math.floor(idx / 4);
  const chipClass = getLabelChipClass(n.label);
  return {
    id: n.id,
    position: { x: 30 + col * 260, y: 20 + row * 125 },
    data: {
      label: (
        <div style={{ textAlign: "left", fontSize: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <span
              className={`tactile-chip ${chipClass}`}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              {n.label.toUpperCase()}
            </span>
            <span
              style={{
                font: "700 11px var(--mono)",
                color: "var(--muted)",
              }}
            >
              #{idx + 1}
            </span>
          </div>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 190,
              font: "700 13px var(--sans)",
              color: "var(--ink)",
            }}
          >
            {n.text || n.id}
          </div>
        </div>
      ),
    },
    style: {
      background: "var(--panel)",
      border: "var(--bw) solid var(--ink)",
      borderRadius: "var(--radius-sm)",
      padding: "8px 12px",
      width: 220,
      boxShadow: "var(--ex-sm)",
    },
  };
}

function createFlowEdge(e: AsOfEdge, idx: number): Edge {
  return {
    id: `e-${e.from}-${e.type}-${e.to}-${idx}`,
    source: e.from,
    target: e.to,
    label: e.type,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { stroke: "#0b0b0d", strokeWidth: 1.5 },
  };
}

function useFlowLayout(nodes: AsOfNode[], edges: AsOfEdge[]) {
  const displayNodes = useMemo(() => nodes.slice(0, 32), [nodes]);
  const nodeMap = useMemo(
    () => new Set(displayNodes.map((n) => n.id)),
    [displayNodes],
  );

  const flowNodes = useMemo<Node[]>(() => {
    return displayNodes.map((n, idx) => createFlowNode(n, idx));
  }, [displayNodes]);

  const flowEdges = useMemo<Edge[]>(() => {
    return edges
      .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
      .slice(0, 40)
      .map((e, idx) => createFlowEdge(e, idx));
  }, [edges, nodeMap]);

  return { flowNodes, flowEdges };
}

function InspectorBody({ node }: { node: AsOfNode }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div>
        <span style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
          ID:
        </span>{" "}
        <code style={{ font: "600 12px var(--mono)" }}>{node.id}</code>
      </div>
      <div>
        <span style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
          TEXT:
        </span>{" "}
        <strong style={{ font: "600 13px var(--sans)" }}>{node.text}</strong>
      </div>
      <div>
        <span style={{ font: "700 11px var(--mono)", color: "var(--muted)" }}>
          VALID AS-OF:
        </span>{" "}
        <span
          className="tactile-chip chip-lime"
          style={{ fontSize: 11, padding: "3px 10px" }}
        >
          {node.timestamp || "Historical"}
        </span>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  onClose,
}: {
  node: AsOfNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        right: 14,
        background: "var(--panel)",
        border: "var(--bw) solid var(--ink)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--ex-md)",
        width: 320,
        fontSize: 12,
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      <div className="window-chrome">
        <div className="window-dots" aria-hidden="true">
          <span className="window-dot dot-red" />
          <span className="window-dot dot-yellow" />
          <span className="window-dot dot-green" />
        </div>
        <span className="window-title">{node.label.toUpperCase()} NODE</span>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            font: "800 11px var(--mono)",
            cursor: "pointer",
          }}
        >
          [X]
        </button>
      </div>
      <InspectorBody node={node} />
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
        <Background color="#ded7c6" gap={16} />
        <Controls />
      </ReactFlow>
      {selectedNode && (
        <NodeInspector
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
