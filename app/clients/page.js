import { supabase } from "@/lib/supabase";
import ClientsList from "./ClientsList";

export const revalidate = 3600;

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

export default async function ClientsPage() {
  const clients = await getClients();
  return <ClientsList clients={clients} />;
}
