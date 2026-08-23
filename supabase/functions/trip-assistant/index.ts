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

// One restaurant option or thing-to-do hanging off a day. Shared by the
// restaurants and activities fields on both day tools.
const PLACE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "What the place is called" },
    address: { type: "string", description: "Street address. Give a real, complete one where you can -- the app geocodes it to drop a pin on the day's map. Leave empty rather than guessing." },
    links: {
      type: "array",
      description: "Any relevant links (menu, booking page, review, map listing)",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short label, e.g. 'Menu'. Optional -- the site's domain is shown if omitted." },
          url: { type: "string" },
        },
        required: ["url"],
      },
    },
    notes: { type: "string", description: "Anything useful: hours, price, why it's worth it, kid-friendliness" },
  },
  required: ["name"],
};

const TOOLS = [
  {
    name: "update_day",
    description: "Queue a proposed update to one existing itinerary day (route/plan text, drive time, overnight stop, lodging, tags, hike/excursion note, or map stops). Does not apply the change -- it queues it for the user to review and approve.",
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
        stops: {
          type: "array",
          description: "IMPORTANT: whenever you change where this day actually goes (overnight, a new stop, a rerouted drive), include a full replacement list of map stops in visit order with your best-effort real-world coordinates, so the day's map stays accurate. Omit this field entirely if the day's locations aren't changing.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              lat: { type: "number" },
              lng: { type: "number" },
              ferry: { type: "boolean", description: "true if the leg from this stop to the next one is a ferry/boat crossing, not a road" },
            },
            required: ["name", "lat", "lng"],
          },
        },
        restaurants: {
          type: "object",
          description: "Full replacement of this day's restaurant options, grouped by meal. Like the other fields here this replaces the whole object, so include every meal you want kept, not just the one changing.",
          properties: {
            breakfast: { type: "array", items: PLACE_SCHEMA },
            lunch: { type: "array", items: PLACE_SCHEMA },
            dinner: { type: "array", items: PLACE_SCHEMA },
          },
        },
        activities: {
          type: "array",
          description: "Full replacement of this day's 'things to do' list (sights, activities, stops worth making). Separate from 'plan', which is the day's narrative schedule.",
          items: PLACE_SCHEMA,
        },
      },
      required: ["dayId"],
    },
  },
  {
    name: "shift_days",
    description: "Shift the date of one day and every day after it by a number of days (positive = later, negative = earlier), keeping all content and order the same. Use this for schedule delays/advances (e.g. 'the ferry only runs Wednesdays, push everything from Day 6 onward by 2 days') instead of calling update_day repeatedly on each day -- this is far cheaper and does the date math for you. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        fromDayId: { type: "string", description: "The first day to shift; this day and all later days shift together" },
        deltaDays: { type: "number", description: "Days to shift by; positive = later, negative = earlier" },
      },
      required: ["fromDayId", "deltaDays"],
    },
  },
  {
    name: "reorder_days",
    description: "Rearrange the existing days into a new order (e.g. swap two days, move a day earlier). Content is preserved; dates and day numbers are recalculated automatically to stay sequential from the trip's start date. Provide ALL existing day ids in the new order -- omitting any is rejected. Prefer this over update_day when you're only changing the sequence, not the content. Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        dayIds: { type: "array", items: { type: "string" }, description: "Every existing day id, in the new desired order" },
      },
      required: ["dayIds"],
    },
  },
  {
    name: "insert_day",
    description: "Insert a brand-new day into the itinerary at a given position. All later days automatically shift later by one day (dates and day numbers recalculated for you). Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: {
        afterDayId: { type: ["string", "null"], description: "Insert after this existing day id, or null to insert as the new Day 1" },
        title: { type: "string" },
        overnight: { type: "string" },
        lodging: { type: "string" },
        drive: { type: "string" },
        plan: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        hike: {
          type: ["object", "null"],
          properties: { name: { type: "string" }, diff: { type: "string" }, note: { type: "string" } },
        },
        stops: {
          type: "array",
          description: "Map stops for this new day, in visit order, with your best-effort real-world coordinates -- include this whenever you know where the day actually goes, so it gets a map immediately.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              lat: { type: "number" },
              lng: { type: "number" },
              ferry: { type: "boolean", description: "true if the leg from this stop to the next one is a ferry/boat crossing, not a road" },
            },
            required: ["name", "lat", "lng"],
          },
        },
        restaurants: {
          type: "object",
          description: "Restaurant options for this new day, grouped by meal.",
          properties: {
            breakfast: { type: "array", items: PLACE_SCHEMA },
            lunch: { type: "array", items: PLACE_SCHEMA },
            dinner: { type: "array", items: PLACE_SCHEMA },
          },
        },
        activities: {
          type: "array",
          description: "'Things to do' for this new day -- sights, activities and stops worth making, separate from the narrative 'plan'.",
          items: PLACE_SCHEMA,
        },
      },
      required: ["title", "overnight"],
    },
  },
  {
    name: "remove_day",
    description: "Remove a day from the itinerary. All later days automatically shift earlier by one day (dates and day numbers recalculated for you). Does not apply it -- queues it for review.",
    input_schema: {
      type: "object",
      properties: { dayId: { type: "string" } },
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
        due: { type: "string", description: "YYYY-MM-DD or empty -- this is the deadline to book/do it by, NOT the trip date it's for" },
        pri: { type: "string", enum: ["very-high", "high", "medium", "low"] },
        notes: { type: "string" },
        dayIds: { type: "array", items: { type: "string" }, description: "For Ferries/Lodging/Tours items only: the id(s) of the itinerary day(s) this booking is actually FOR (e.g. the ferry's departure day, every night of a multi-night stay). This is what the Reservations tab sorts by -- distinct from `due`, which is just the booking deadline. Omit for non-bookable categories." },
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
        dayIds: { type: "array", items: { type: "string" }, description: "Full replacement list of itinerary day id(s) this booking is FOR (not the due-date deadline) -- update this if the day(s) the item pertains to changes." },
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
        cost: { type: "number", description: "Total price of the booking, if known" },
        paymentDue: { type: "string", description: "YYYY-MM-DD -- date any remaining balance is due, if known. Omit if already paid in full." },
        category: { type: "string", description: "Name of an existing budget category this cost belongs to (must match one of the trip's budget category names exactly), so the Budget tab's actual-vs-estimate tally picks it up. Omit if unclear." },
        paid: { type: "boolean", description: "true if this has already been paid" },
        paidDate: { type: "string", description: "YYYY-MM-DD the payment was made -- only meaningful when paid is true" },
        card: { type: "string", description: "Which card/account it was charged to, e.g. 'Chase Sapphire' or 'Amex ...1234'" },
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
        cost: { type: "number" },
        paymentDue: { type: "string", description: "YYYY-MM-DD, or empty to clear it" },
        category: { type: "string", description: "Must match one of the trip's existing budget category names exactly" },
        paid: { type: "boolean" },
        paidDate: { type: "string", description: "YYYY-MM-DD, or empty to clear it" },
        card: { type: "string" },
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

SCHEDULE CHANGES -- prefer the cheap structural tools: for anything about WHEN or in what ORDER days happen -- a delay, an early start, swapping days, inserting or removing a day -- always use shift_days / reorder_days / insert_day / remove_day instead of calling update_day on every affected day. These do the date/renumbering math for you in one call, whereas rewriting each day's full content via update_day is slow and expensive. Example: "the ferry only runs Wednesdays, push everything from Day 6 on by 2 days" is exactly one shift_days call, not six update_day calls. Only reach for update_day when a day's actual content (title, plan steps, overnight, hike, etc) needs to change, not just its date or position. shift_days and reorder_days move whole days as-is, so a day's map stops travel with it automatically -- you don't need to touch them for a pure schedule change.

MAP STOPS -- each day's real-world locations for its map live on the day itself (the 'stops' field), not somewhere else, so they only go stale if you forget to update them. Whenever update_day changes where a day actually goes (overnight, an added/removed stop, a rerouted drive) or insert_day creates a new day, include a full replacement 'stops' array with your best-effort real coordinates for every place visited that day, in order -- flag a stop's ferry:true if the leg to the next stop is a boat crossing, not a road. If a day's locations aren't changing, omit 'stops' entirely and leave it as-is.

CHECKLIST ITEM DATES -- a Ferries/Lodging/Tours checklist item has two different dates: 'due' (the deadline to book it by) and 'dayIds' (which itinerary day(s) it's actually FOR, e.g. the ferry's departure day, every night of a multi-night stay). The Reservations tab sorts "Needs a booking" by dayIds, not due -- always set dayIds on add_todo/update_todo for bookable items when you know which day(s) they're for, even if you also set a due date.

RESTAURANTS AND THINGS TO DO -- these are structured lists on the day, not prose in 'plan'. Places to eat go in 'restaurants' (grouped into breakfast/lunch/dinner); sights, activities and worthwhile stops go in 'activities'. Each entry takes a name, an optional street address, optional links and notes. Give a real complete address whenever you're confident of it -- the app geocodes it and drops a pin on that day's map, which is most of the value of these lists; leave it empty rather than inventing one. Both fields fully replace what's there, so include the entries you want kept, not just the new ones.

IMPORTANT -- pace yourself on big requests: the server that runs you has its own time limit per reply, separate from your token budget, and a reply that tries to do too much can be cut off with nothing delivered at all. If a request would still mean touching more than about 4-5 days/items with update_day in one go (i.e. real content changes, not just schedule shifts, which the structural tools above already handle cheaply), don't attempt it all in one reply -- propose the first 4-5, briefly say what's left, and let the conversation continue.

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
