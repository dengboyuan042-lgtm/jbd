'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

import '@xyflow/react/dist/style.css';

import { Page, PageHeader } from '@/components/shell/page';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { Citation, MindMapGraph } from '@/server/db/schema';
import { usePanel } from '@/features/workspace/workspace-context';
import { useCitationNavigation } from '@/features/chat/citation';

type MapData = {
  mindMap: { id: string; title: string; graph: MindMapGraph };
};

type NodeData = {
  label: string;
  kind: 'root' | 'topic' | 'subtopic' | 'concept';
  detail?: string;
  citation?: Citation;
  collapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onOpenCitation: () => void;
};

/**
 * Mind map rendered with a radial-ish layered layout. Nodes carry the citation
 * that produced them, so expanding an idea and jumping to its source are the
 * same gesture.
 */
export function MindMapView({ mapId }: { mapId: string }) {
  const { data, loading, error, refresh } = useApi<MapData>(`/api/mindmaps/${mapId}`);
  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-40" />} />
        <div className="p-5">
          <Skeleton className="h-[60dvh] w-full rounded-lg" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <ErrorState description={error ?? 'Mind map not found.'} onRetry={refresh} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/study"
            className="inline-flex items-center gap-1 text-2xs text-tertiary transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3" />
            Study
          </Link>
        }
        title={data.mindMap.title}
        subtitle={`${data.mindMap.graph.nodes.length} nodes · click a node to expand, double-click to open its source`}
      />
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Graph graph={data.mindMap.graph} />
        </ReactFlowProvider>
      </div>
    </Page>
  );
}

function Graph({ graph }: { graph: MindMapGraph }) {
  const navigate = useCitationNavigation();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const childrenOf = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of graph.edges) {
      map.set(edge.source, [...(map.get(edge.source) ?? []), edge.target]);
    }
    return map;
  }, [graph.edges]);

  const hidden = React.useMemo(() => {
    const result = new Set<string>();
    const walk = (id: string) => {
      for (const child of childrenOf.get(id) ?? []) {
        if (result.has(child)) continue;
        result.add(child);
        walk(child);
      }
    };
    for (const id of collapsed) walk(id);
    return result;
  }, [collapsed, childrenOf]);

  const layout = React.useMemo(
    () => computeLayout(graph, hidden),
    [graph, hidden],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  React.useEffect(() => {
    setNodes(
      layout.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          collapsed: collapsed.has(node.id),
          hasChildren: (childrenOf.get(node.id) ?? []).length > 0,
          onToggle: () =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            }),
          onOpenCitation: () => {
            const citation = node.data.citation;
            if (citation) navigate(citation);
          },
        },
      })),
    );
    setEdges(layout.edges);
  }, [layout, collapsed, childrenOf, navigate, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="bg-bg-sunken"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="opacity-60" />
      <Controls showInteractive={false} className="!shadow-none" />
    </ReactFlow>
  );
}

function MindNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div
      onDoubleClick={data.onOpenCitation}
      className={cn(
        'group max-w-56 rounded-lg border bg-surface px-3 py-2 shadow-xs transition-[border-color,box-shadow] hover:shadow-sm',
        data.kind === 'root'
          ? 'border-fg bg-fg text-inverse'
          : data.kind === 'topic'
            ? 'border-[var(--accent-border)] bg-accent-subtle'
            : 'border-border',
      )}
    >
      <p
        className={cn(
          'text-xs font-medium',
          data.kind === 'root' ? 'text-inverse' : data.kind === 'topic' ? 'text-accent-text' : 'text-fg',
        )}
      >
        {data.label}
      </p>
      {data.detail && data.kind !== 'root' ? (
        <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-tertiary">{data.detail}</p>
      ) : null}
      {data.hasChildren ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle();
          }}
          className="absolute -right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-tertiary shadow-xs transition-colors hover:text-fg"
          aria-label={data.collapsed ? 'Expand' : 'Collapse'}
        >
          {data.collapsed ? <Plus className="size-2.5" /> : <Minus className="size-2.5" />}
        </button>
      ) : null}
      {data.citation ? (
        <ChevronRight className="absolute -bottom-1 -right-1 size-3 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </div>
  );
}

const NODE_TYPES = { mind: MindNode };

/** Layered left-to-right layout with vertical distribution by subtree size. */
function computeLayout(graph: MindMapGraph, hidden: Set<string>) {
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const edge of graph.edges) {
    childrenOf.set(edge.source, [...(childrenOf.get(edge.source) ?? []), edge.target]);
    parentOf.set(edge.target, edge.source);
  }

  const root =
    graph.nodes.find((n) => n.kind === 'root')?.id ?? graph.nodes[0]?.id ?? 'root';

  const depth = new Map<string, number>();
  const order: string[] = [];
  const queue: string[] = [root];
  depth.set(root, 0);
  while (queue.length) {
    const id = queue.shift()!;
    if (hidden.has(id)) continue;
    order.push(id);
    for (const child of childrenOf.get(id) ?? []) {
      if (hidden.has(child) || depth.has(child)) continue;
      depth.set(child, (depth.get(id) ?? 0) + 1);
      queue.push(child);
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), id]);
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const positioned: Node<NodeData>[] = [];

  for (const [d, ids] of byDepth) {
    const spacing = 92;
    const offset = ((ids.length - 1) * spacing) / 2;
    ids.forEach((id, i) => {
      const node = nodeById.get(id);
      if (!node) return;
      positioned.push({
        id,
        type: 'mind',
        position: { x: d * 260, y: i * spacing - offset },
        data: {
          label: node.label,
          kind: node.kind,
          detail: node.detail,
          citation: node.citation,
          collapsed: false,
          hasChildren: false,
          onToggle: () => undefined,
          onOpenCitation: () => undefined,
        },
        draggable: true,
      });
    });
  }

  const visible = new Set(positioned.map((n) => n.id));
  const edges: Edge[] = graph.edges
    .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 1.2 },
    }));

  return { nodes: positioned, edges };
}
