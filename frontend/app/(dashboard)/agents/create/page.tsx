import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CreateAgentClient } from "./client";

export default async function CreateAgentPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <CreateAgentClient />;
}
