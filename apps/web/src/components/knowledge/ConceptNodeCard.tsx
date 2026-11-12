"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { STATUS_NAME, type Direction, type Status } from "@/lib/knowledgeMap";
import { NODE_STYLE, StatusMark } from "./StatusMark";

export type ConceptNodeData = {
  label: string;
  status: Status;
  /** 検証済みの進み具合（例：1 / 2）。分からないときは null */
  progress: string | null;
  ratio: number | null;
  dir: Direction;
  width: number;
  height: number;
};
export type ConceptFlowNode = Node<ConceptNodeData, "concept">;

const HIDDEN = { opacity: 0, pointerEvents: "none" as const, width: 1, height: 1, minWidth: 1, minHeight: 1 };

/** 知識マップのノード。状態を文字とアイコンで出す。選んだノードは黄色の枠（docs/04 の 6.1） */
export function ConceptNodeCard({ data, selected }: NodeProps<ConceptFlowNode>) {
  const lr = data.dir === "LR";
  return (
    <div
      style={{ width: data.width, height: data.height }}
      className={`flex flex-col justify-center rounded-[18px] px-3.5 py-2 ${NODE_STYLE[data.status]} ${
        selected ? "outline-[4px] outline-offset-2 outline-[#F6C343]" : ""
      } cursor-pointer [.react-flow__node:focus-visible_&]:ring-[3px] [.react-flow__node:focus-visible_&]:ring-link [.react-flow__node:focus-visible_&]:ring-offset-2`}
    >
      <Handle type="target" position={lr ? Position.Left : Position.Top} style={HIDDEN} isConnectable={false} />
      <p className="text-[15px] leading-tight font-bold break-words">{data.label}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-bold">
        <StatusMark status={data.status} ratio={data.ratio} />
        <span>{STATUS_NAME[data.status]}</span>
        {data.progress && <span className="font-normal text-sub tabular-nums">{data.progress}</span>}
      </p>
      <Handle type="source" position={lr ? Position.Right : Position.Bottom} style={HIDDEN} isConnectable={false} />
    </div>
  );
}
