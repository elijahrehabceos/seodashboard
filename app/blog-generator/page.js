import { supabase } from "@/lib/supabase";
import BlogGeneratorForm from "./BlogGeneratorForm";

export const revalidate = 3600;

async function getClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("slug, clinic_name")
    .order("clinic_name", { ascending: true });
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

export default async function BlogGeneratorPage() {
  const clients = await getClients();
  return <BlogGeneratorForm clients={clients} />;
}
