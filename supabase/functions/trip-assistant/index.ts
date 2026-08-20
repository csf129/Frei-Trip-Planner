// Supabase Edge Function: trip-assistant
//
// Stateless chat endpoint backing the in-app AI planning assistant. The
// client sends the full conversation history each turn (plus the current
// trip data as context); this function calls Claude with tool-use and
// returns its response untouched. Nothing here writes to the database --
// the assistant only *proposes* changes via tool calls, which the client
// renders as review cards and applies through the app's normal
// updateTrip() path (same one every Add/Edit modal already uses) only
// after the user approves. That keeps this function's blast radius to
// "read trip data, talk to Claude" -- no direct database writes at all.
//
// Anthropic only (no OpenAI fallback here, unlike parse-reservation) --
// tool-use request/response shapes differ enough between providers that
// supporting both would roughly double this function's complexity for a
// personal app.
//
// Same auth hardening as parse-reservation: "Verify JWT" alone accepts the
// public anon key, so this function explicitly resolves the caller to a
// real signed-in user and rejects anonymous callers itself.
//
// Deploy via the Supabase Dashboard's Edge Functions editor, or:
//   supabase functions deploy trip-assistant
// Reuses the ANTHROPIC_API_KEY secret already set for parse-reservation --
// no new secrets needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    name: "update_day",
    description: "Queue a proposed update to one existing itinerary day (route/plan text, drive time, overnight stop, lodging, tags, or the hike/excursion note). Does not apply the change -- it queues it for the user to review and approve.",
    input_schema: {
      type: "object",
      properties: {
        dayId: { type: "string", description: "The id of the day to update" },
        title: { type: "string" },
        drive: { type: "string" },
        overnight: { type: "string" },
        lodging: { type: "string" },
        plan: { type: "array", items: { type: "string" }, description: "Full replacement list of plan steps for the day" },
        tags: { type: "array", items: { type: "string" } },
        hike: {
          type: ["object", "null"],
          description: "Excursion/hike info, or null to remove it",
          properties: { name: { type: "string" }, diff: { type: "string" }, note: { type: "string" } },
        },
      },
      required: ["dayId"],
    },
  },
  {
    name: "add_todo",
    description: "Queue a new pre-trip checklist item. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        cat: { type: "string", description: "Category, e.g. Ferries, Lodging, Tours, Documents, Vehicle, Health, Packing, Money, Planning" },
        due: { type: "string", description: "YYYY-MM-DD or empty" },
        pri: { type: "string", enum: ["very-high", "high", "medium", "low"] },
        notes: { type: "string" },
      },
      required: ["title", "cat"],
    },
  },
  {
    name: "update_todo",
    description: "Queue an update to an existing checklist item (including marking it done). Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        todoId: { type: "string" },
        title: { type: "string" },
        cat: { type: "string" },
        due: { type: "string" },
        pri: { type: "string", enum: ["very-high", "high", "medium", "low"] },
        notes: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["todoId"],
    },
  },
  {
    name: "delete_todo",
    description: "Queue the removal of a checklist item. Does not apply it -- queues it for review.",
    input_schema: { type: "object", properties: { todoId: { type: "string" } }, required: ["todoId"] },
  },
  {
    name: "add_reservation",
    description: "Queue a new reservation (hotel/ferry/tour/flight/car rental). Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["Hotel", "Ferry", "Tour", "Flight", "Car Rental", "Other"] },
        title: { type: "string" },
        host: { type: "string" },
        location: { type: "string" },
        confirmationNumber: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        dayIds: { type: "array", items: { type: "string" }, description: "ids of any itinerary days this covers" },
        todoIds: { type: "array", items: { type: "string" }, description: "ids of any checklist items this fulfills" },
        notes: { type: "string" },
      },
      required: ["type", "title"],
    },
  },
  {
    name: "update_reservation",
    description: "Queue an update to an existing reservation. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        reservationId: { type: "string" },
        type: { type: "string" },
        title: { type: "string" },
        host: { type: "string" },
        location: { type: "string" },
        confirmationNumber: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        dayIds: { type: "array", items: { type: "string" } },
        todoIds: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["reservationId"],
    },
  },
  {
    name: "add_expense",
    description: "Queue a new logged expense against the budget. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string" },
        category: { type: "string" },
        amount: { type: "number" },
        date: { type: "string" },
        who: { type: "string" },
      },
      required: ["label", "category", "amount"],
    },
  },
  {
    name: "update_budget_category",
    description: "Queue a change to a budget category's estimated cost. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: { categoryId: { type: "string" }, est: { type: "number" } },
      required: ["categoryId", "est"],
    },
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function systemPrompt(trip: unknown) {
  return `You are the trip-planning assistant inside "Fern & Ferry", a family trip planner app. You're helping plan the trip described below. Answer questions directly and helpfully. When the user asks you to change something -- update a day's plan, add a checklist item, log an expense, add or update a reservation, etc. -- call the matching tool. Calling a tool ONLY queues that change for the family to review and approve in the app; it is never applied immediately, so feel free to propose changes when they'd clearly help, and briefly say what you proposed. Always use real ids from the trip data below when referencing an existing day/todo/reservation -- never invent one. Keep replies concise and conversational.

Current trip data (JSON):
${JSON.stringify(trip)}`;
}

// Anthropic caps how long a *non-streaming* request may run before it
// rejects it outright -- large multi-day itinerary rewrites (lots of
// tool-call output, plus adaptive-thinking tokens, all counted against
// max_tokens) can need more room than that allows. Streaming removes that
// ceiling, so this reads the SSE stream and reassembles it into the same
// {content, stop_reason} shape the client already expects -- no client
// changes needed, this is purely an internal fetch-vs-fetch swap.
async function streamAnthropicMessage(anthropicKey: string, body: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
  }

  const contentBlocks: any[] = [];
  const jsonBuffers: Record<number, string> = {};
  let stopReason: string | null = null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const evt of events) {
      const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const payload = JSON.parse(dataLine.slice(6));

      if (payload.type === "content_block_start") {
        contentBlocks[payload.index] = { ...payload.content_block };
        if (payload.content_block.type === "tool_use") jsonBuffers[payload.index] = "";
      } else if (payload.type === "content_block_delta") {
        const idx = payload.index;
        if (payload.delta.type === "text_delta") {
          contentBlocks[idx].text = (contentBlocks[idx].text || "") + payload.delta.text;
        } else if (payload.delta.type === "input_json_delta") {
          jsonBuffers[idx] = (jsonBuffers[idx] || "") + payload.delta.partial_json;
        } else if (payload.delta.type === "thinking_delta") {
          contentBlocks[idx].thinking = (contentBlocks[idx].thinking || "") + payload.delta.thinking;
        } else if (payload.delta.type === "signature_delta") {
          // Thinking blocks must be echoed back with their signature intact
          // on later turns (same-model continuation) or the API rejects
          // the request -- capture it here so history stays valid.
          contentBlocks[idx].signature = (contentBlocks[idx].signature || "") + payload.delta.signature;
        }
      } else if (payload.type === "content_block_stop") {
        const idx = payload.index;
        if (contentBlocks[idx]?.type === "tool_use") {
          try { contentBlocks[idx].input = JSON.parse(jsonBuffers[idx] || "{}"); }
          catch { contentBlocks[idx].input = {}; }
        }
      } else if (payload.type === "message_delta") {
        stopReason = payload.delta?.stop_reason ?? stopReason;
      }
    }
  }

  return { content: contentBlocks.filter(Boolean), stop_reason: stopReason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { messages, trip } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: "Missing messages" }, 400);
    if (!trip) return json({ error: "Missing trip" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "Sign in required." }, 401);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return json({ error: "The trip assistant needs an ANTHROPIC_API_KEY function secret." }, 500);
    }

    // Large multi-day restructuring asks (e.g. "reshuffle the itinerary
    // around this new ferry schedule") can need a lot of room -- both for
    // the tool-call output itself and for adaptive-thinking tokens, which
    // count against the same max_tokens budget. Streaming (above) lifts
    // the request-duration ceiling that made anything past ~8K risky
    // without it; effort stays at the default ("high") for better
    // reasoning quality on these asks.
    const data = await streamAnthropicMessage(anthropicKey, {
      model: "claude-sonnet-5",
      max_tokens: 32000,
      system: systemPrompt(trip),
      tools: TOOLS,
      messages,
    });

    return json(data, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
