import { supabase } from "@/lib/supabase";
import DashboardHome from "./DashboardHome";

export const revalidate = 3600; // re-check at most hourly

async function getClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("slug, clinic_name, owner_name")
    .order("clinic_name", { ascending: true });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

export default async function Page() {
  const clients = await getClients();
  return <DashboardHome clients={clients} />;
}
