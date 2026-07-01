import Link from "next/link";
import { supabase } from "@/lib/supabase";
import ClientChat from "./ClientChat";

export const revalidate = 3600;

async function getClientData(slug) {
  const [{ data: client }, { data: keywords }, { data: ai }, { data: local }, { data: insight }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("slug", slug).single(),
      supabase
        .from("keyword_rankings")
        .select("*")
        .eq("client_slug", slug)
        .order("position", { ascending: true }),
      supabase.from("ai_visibility").select("*").eq("client_slug", slug),
      supabase.from("local_pack").select("*").eq("client_slug", slug),
      supabase.from("client_insights").select("*").eq("client_slug", slug).maybeSingle(),
    ]);

  return {
    client,
    keywords: keywords || [],
    ai: ai || [],
    local: local || [],
    insight,
  };
}

function rankColor(position) {
  if (position && position > 0 && position <= 3) return "text-[#16a34a]";
  return "text-gold";
}

function mentionColor(mentioned) {
  return mentioned ? "text-[#16a34a]" : "text-gold";
}

export default async function ClientPage({ params }) {
  const { client, keywords, ai, local, insight } = await getClientData(params.slug);

  if (!client) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-gray-400">
          No data for this client yet.{" "}
          <Link href="/" className="text-gold underline">
            Back to dashboard
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <Link href="/" className="text-sm text-gray-400 hover:text-gold">
        ← All clients
      </Link>
      <h1 className="text-3xl font-extrabold mt-4">{client.clinic_name}</h1>
      <p className="text-gray-400 mb-6">{client.owner_name}</p>

      {insight?.blurb && (
        <div className="bg-gold/5 border border-gold/20 rounded-xl px-5 py-4 mb-10 text-sm text-gray-200 leading-relaxed">
          {insight.blurb}
        </div>
      )}

      {/* Keyword rankings */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4 text-gold">Keyword Rankings</h2>
        {keywords.length === 0 ? (
          <p className="text-gray-500 text-sm">No ranking data yet.</p>
        ) : (
          <div className="bg-panel border border-white/10 rounded-xl divide-y divide-white/10">
            {keywords.map((k) => (
              <div
                key={k.id}
                className="flex justify-between items-center px-5 py-3"
              >
                <span>{k.keyword}</span>
                <span className={`font-bold ${rankColor(k.position)}`}>
                  {k.position ? `#${k.position}` : "Not ranked"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI visibility */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4 text-gold">AI Visibility</h2>
        {ai.length === 0 ? (
          <p className="text-gray-500 text-sm">AI tracking not set up for this client.</p>
        ) : (
          <div className="bg-panel border border-white/10 rounded-xl divide-y divide-white/10">
            {ai.map((a) => (
              <div
                key={a.id}
                className="flex justify-between items-center px-5 py-3"
              >
                <span className="capitalize">{a.engine.replace(/_/g, " ")}</span>
                <span className={`font-bold ${mentionColor(a.mentioned)}`}>
                  {a.mentioned ? "Mentioned in tracked prompt" : "Not mentioned"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Local pack */}
      <section>
        <h2 className="text-xl font-bold mb-4 text-gold">Local Pack Rankings</h2>
        {local.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No Local Falcon data yet for this client.
          </p>
        ) : (
          <div className="grid gap-4">
            {local.map((l) => (
              <div
                key={l.id}
                className="bg-panel border border-white/10 rounded-xl p-5"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold">{l.keyword}</div>
                    <div className="text-sm text-gray-400">
                      {l.location_label}
                    </div>
                  </div>
                  {l.heatmap_url && (
                    <a
                      href={l.heatmap_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-gold underline"
                    >
                      Heatmap
                    </a>
                  )}
                </div>
                <div className="flex gap-6 text-sm text-gray-300">
                  <span>
                    ARP: <span className={rankColor(l.arp)}>{l.arp ?? "—"}</span>
                  </span>
                  <span>
                    ATRP:{" "}
                    <span className={rankColor(l.atrp)}>{l.atrp ?? "—"}</span>
                  </span>
                  <span>SoLV: {l.solv != null ? `${l.solv}%` : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ClientChat slug={params.slug} />
    </main>
  );
}
