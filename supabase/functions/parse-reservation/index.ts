// Supabase Edge Function: parse-reservation
//
// Reads a just-uploaded file from the private `reservation-files` bucket,
// sends it to whichever AI vision provider has a secret configured
// (ANTHROPIC_API_KEY preferred, falls back to OPENAI_API_KEY), and returns
// the extracted reservation fields as JSON for the client to pre-fill into
// the add/edit form (never auto-saved — the user always reviews it first).
//
// "Verify JWT" alone is NOT enough here: it only checks that the caller
// presented *some* valid Supabase key, and the public anon/publishable key
// (visible to anyone in the browser bundle) counts as valid. So this
// function also explicitly resolves the caller's JWT to a real signed-in
// user via auth.getUser() and rejects anonymous callers itself — otherwise
// anyone could invoke this directly and run up the AI API bill.
//
// Deploy via the Supabase Dashboard's Edge Functions editor, or:
//   supabase functions deploy parse-reservation
// Then set secrets (Dashboard -> Edge Functions -> Secrets, or CLI):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set OPENAI_API_KEY=sk-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "reservation-files";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract structured trip-reservation details from an image of a confirmation (hotel, ferry, tour, flight, car rental, etc.).
Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "type": "Hotel" | "Ferry" | "Tour" | "Flight" | "Car Rental" | "Other",
  "title": string,
  "host": string,
  "location": string,
  "confirmationNumber": string,
  "startDate": string,
  "endDate": string,
  "startTime": string,
  "endTime": string,
  "notes": string
}
Dates must be YYYY-MM-DD, times HH:MM 24h. Use "" for any field you can't find. Never invent information that isn't in the image.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function parseModelJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function callAnthropic(apiKey: string, base64: string, mediaType: string) {
  // The Messages API's `image` content block only accepts raster image
  // media types (jpeg/png/gif/webp) -- a PDF sent that way is rejected.
  // PDFs need the separate `document` block type instead.
  const isPdf = mediaType === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: `Extract the reservation details from this ${isPdf ? "document" : "image"}.` },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return parseModelJson(data.content[0].text);
}

async function callOpenAI(apiKey: string, base64: string, mediaType: string) {
  // OpenAI's chat completions vision endpoint only takes actual images via
  // image_url -- PDFs need a separate Files/Assistants flow this function
  // doesn't implement. Fail clearly instead of sending a PDF as an "image".
  if (mediaType === "application/pdf") {
    throw new Error("PDF parsing needs an ANTHROPIC_API_KEY secret -- OpenAI's vision API here only supports image files (JPG/PNG/etc).");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the reservation details from this image." },
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return parseModelJson(data.choices[0].message.content);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { path } = await req.json();
    if (!path) return json({ error: "Missing path" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "Sign in required." }, 401);
    }

    const { data: file, error: dlError } = await admin.storage.from(BUCKET).download(path);
    if (dlError || !file) return json({ error: `Could not read uploaded file: ${dlError?.message || "not found"}` }, 400);

    const base64 = await toBase64(file);
    const mediaType = file.type || "image/jpeg";

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!anthropicKey && !openaiKey) {
      return json({ error: "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY as a function secret." }, 500);
    }

    const extracted = anthropicKey
      ? await callAnthropic(anthropicKey, base64, mediaType)
      : await callOpenAI(openaiKey!, base64, mediaType);

    return json(extracted, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
