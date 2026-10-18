"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";

export type GraphNode = {
  id: string;
  label: string;
  text: string | null;
};

export type GraphPath = {
  kind: "decision" | "incident" | "blast";
  nodes: GraphNode[];
  edges: { from: string; to: string; type: string }[];
};

type PathGraphProps = {
  paths: GraphPath[];
  repository: string;
  pullNumber?: number;
  className?: string;
};

type FlowNodeData = { label: string; title: string; text: string };
type FlowNode = Node<FlowNodeData, "evidence">;

function EvidenceNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className={`evidence-node evidence-${data.label.toLowerCase()}`}>
      <Handle type="target" position={Position.Left} />
      <span className="evidence-type">{data.label}</span>
      <strong>{data.title}</strong>
      {data.text ? <small>{data.text}</small> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { evidence: EvidenceNode };

function shortText(value: string | null, max = 100): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, max - 1)}…`
    : normalized;
}

function commentUrl(
  repository: string,
  id: string,
  pullNumber?: number,
): string | null {
  const match = id.match(/^comment:review:(\d+)$/);
  return match && pullNumber
    ? `https://github.com/${repository}/pull/${pullNumber}#discussion_r${match[1]}`
    : null;
}

export default function PathGraph({
  paths,
  repository,
  pullNumber,
  className = "",
}: PathGraphProps) {
  const usablePaths = useMemo(
    () =>
      paths.filter(({ nodes, edges }) => nodes.length > 0 && edges.length > 0),
    [paths],
  );
  const kinds = [...new Set(usablePaths.map(({ kind }) => kind))];
  const initialKind = kinds.includes("decision")
    ? "decision"
    : (kinds[0] ?? "decision");
  const [selectedKind, setSelectedKind] = useState(initialKind);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeEdge, setActiveEdge] = useState(0);
  const [playing, setPlaying] = useState(false);
  const kindPaths = usablePaths.filter(({ kind }) => kind === selectedKind);
  const path = kindPaths[selectedIndex] ?? kindPaths[0] ?? usablePaths[0];

  useEffect(() => {
    setSelectedKind(initialKind);
    setSelectedIndex(0);
  }, [initialKind]);

  useEffect(() => {
    setActiveEdge((path?.edges.length ?? 0) - 1);
    setSelectedNode(
      path?.nodes.find(({ label }) => label === "Comment") ?? null,
    );
    setPlaying(false);
  }, [path]);

  useEffect(() => {
    if (!playing || !path) return;
    const timer = window.setInterval(() => {
      setActiveEdge((current) => {
        if (current + 1 >= path.edges.length) {
          window.clearInterval(timer);
          setPlaying(false);
          return path.edges.length - 1;
        }
        return current + 1;
      });
    }, 720);
    return () => window.clearInterval(timer);
  }, [path, playing]);

  const flowNodes = useMemo<FlowNode[]>(() => {
    if (!path) return [];
    return path.nodes.map((node, index) => ({
      id: node.id,
      type: "evidence",
      position: { x: 40 + index * 285, y: index % 2 === 0 ? 88 : 184 },
      data: {
        label: node.label,
        title: node.text?.split("\n")[0] ?? node.id,
        text: shortText(node.text?.split("\n").slice(1).join(" ") ?? null, 60),
      },
    }));
  }, [path]);

  const flowEdges = useMemo<Edge[]>(() => {
    if (!path) return [];
    return path.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.type}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.type.replaceAll("_", " "),
      type: "smoothstep",
      animated: playing && index === activeEdge,
      style: {
        stroke: index <= activeEdge ? "#c35b3e" : "#bcb8ae",
        strokeWidth: index === activeEdge ? 2.4 : 1.4,
      },
      labelStyle: { fill: "#706c63", fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: "#f7f5ef", fillOpacity: 0.96 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: index <= activeEdge ? "#c35b3e" : "#bcb8ae",
      },
    }));
  }, [activeEdge, path, playing]);

  if (!usablePaths.length) {
    return (
      <div className={`graph-empty ${className}`}>
        <div className="empty-glyph">—</div>
        <strong>No evidence path for this function</strong>
        <p>
          When the graph can connect a source to this code, the path will appear
          here.
        </p>
      </div>
    );
  }

  const activeNode =
    selectedNode ??
    path?.nodes.find(({ label }) => label === "Comment") ??
    path?.nodes[0] ??
    null;
  const source = activeNode
    ? commentUrl(repository, activeNode.id, pullNumber)
    : null;

  return (
    <section className={`graph-card ${className}`} aria-label="Evidence paths">
      <div className="graph-toolbar">
        <div>
          <span className="section-index">GRAPH / EVIDENCE</span>
          <h2>Follow the source</h2>
        </div>
        <div className="graph-controls">
          <button
            className="button button-outline button-small"
            onClick={() => {
              if (playing) setPlaying(false);
              else {
                setActiveEdge(-1);
                setPlaying(true);
              }
            }}
            type="button"
          >
            {playing ? "Pause path" : "Play path"}
          </button>
          <span className="path-count">{usablePaths.length} paths</span>
        </div>
      </div>
      {usablePaths.length > 1 ? (
        <div
          className="path-tabs"
          role="tablist"
          aria-label="Evidence path type"
        >
          {kinds.length > 1
            ? kinds.map((kind) => (
                <button
                  aria-selected={kind === selectedKind}
                  className={
                    kind === selectedKind ? "path-tab is-active" : "path-tab"
                  }
                  key={kind}
                  onClick={() => {
                    setSelectedKind(kind);
                    setSelectedIndex(0);
                  }}
                  role="tab"
                  type="button"
                >
                  {kind}{" "}
                  <span>
                    {usablePaths.filter((item) => item.kind === kind).length}
                  </span>
                </button>
              ))
            : null}
          {kindPaths.length > 1 ? (
            <label className="path-select-label">
              <span>Path</span>
              <select
                aria-label={`Select ${selectedKind} evidence path`}
                value={selectedIndex}
                onChange={(event) =>
                  setSelectedIndex(Number(event.target.value))
                }
              >
                {kindPaths.map((item, index) => {
                  const comment = item.nodes.find(
                    ({ label }) => label === "Comment",
                  );
                  const summary = (
                    comment?.text ??
                    item.nodes[0]?.text ??
                    "Evidence path"
                  )
                    .replace(/\s+/g, " ")
                    .slice(0, 68);
                  return (
                    <option key={`${item.nodes[0]?.id}-${index}`} value={index}>
                      {`${index + 1}. ${summary}`}
                    </option>
                  );
                })}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="graph-canvas">
        <ReactFlow
          edges={flowEdges}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.35, maxZoom: 1 }}
          maxZoom={1.4}
          minZoom={0.28}
          nodes={flowNodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) =>
            setSelectedNode(
              path?.nodes.find(({ id }) => id === node.id) ?? null,
            )
          }
          panOnScroll
          zoomOnDoubleClick={false}
        >
          <Background color="#d9d5cb" gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="source-drawer" aria-live="polite">
        <div className="source-icon">
          {activeNode?.label.slice(0, 1) ?? "S"}
        </div>
        <div className="source-content">
          <span className="section-index">
            SELECTED SOURCE · {activeNode?.label ?? "NODE"}
          </span>
          <p>
            {activeNode?.text ?? "Select a node to inspect its source text."}
          </p>
        </div>
        {source ? (
          <a
            className="source-link"
            href={source}
            target="_blank"
            rel="noreferrer"
          >
            Open on GitHub
          </a>
        ) : null}
      </div>
      <div className="graph-caption">
        <span>Directed graph evidence</span>
        <span>Click a node to inspect its source</span>
      </div>
    </section>
  );
}
