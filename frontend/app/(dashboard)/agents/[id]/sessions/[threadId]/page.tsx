import { SessionAnalysisClient } from "./client";

interface Props {
  params: Promise<{ id: string; threadId: string }>;
}

export default async function SessionAnalysisPage({ params }: Props) {
  const { id, threadId } = await params;
  return <SessionAnalysisClient agentId={id} threadId={threadId} />;
}
