import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ManualBuildClient } from "./client";

export default async function ManualBuildPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <ManualBuildClient />;
}
