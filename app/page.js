import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const revalidate = 3600; // re-render at most hourly

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

export default async function HomePage() {
  const clients = await getClients();

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-800 mb-1">
        CEOs <span className="text-gold">SEO</span>
      </h1>
      <p className="text-gray-400 mb-10">
        Live rankings, AI visibility, and local pack data for every client.
      </p>

      {clients.length === 0 ? (
        <p className="text-gray-500">
          No client data yet. The first daily refresh hasn&apos;t run, or the
          Supabase connection isn&apos;t configured.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((c) => (
            <Link
              key={c.slug}
              href={`/client/${c.slug}`}
              className="block bg-panel border border-white/10 rounded-xl p-6 hover:border-gold transition-colors"
            >
              <div className="text-lg font-700 leading-snug">
                {c.clinic_name}
              </div>
              <div className="text-sm text-gray-400 mt-2">{c.owner_name}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
