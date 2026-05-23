import { PlanEditorClient } from "./plan-editor-client";

export default function PlanEditorPage({ params }: { params: { id: string } }) {
  return <PlanEditorClient id={params.id} />;
}
