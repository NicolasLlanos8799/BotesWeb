import db from "../lib/db.js";
import { log, warn, error as logError } from "../lib/logger.js";
import { isRateLimited, getIp } from "../lib/rateLimit.js";

/**
 * DEMO Booking Endpoint
 *
 * Bypasses SumUp entirely. Accepts booking metadata directly,
 * saves to Postgres with a DEMO- prefixed fake sumup_id,
 * and triggers GAS_DEMO_URL to create the calendar event + send email.
 * Only works when APP_ENV === "demo".
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if ((process.env.APP_ENV || "demo") !== "demo") {
    return res.status(403).json({ error: "Demo endpoint not available in production" });
  }

  if (isRateLimited(`demo-booking:${getIp(req)}`, { max: 20, windowMs: 15 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  const GAS_DEMO_URL = process.env.GAS_DEMO_URL || process.env.GAS_URL;
  const metadata = req.body || {};

  if (!metadata.date || !metadata.time || !metadata.name) {
    return res.status(400).json({ error: "Missing required booking fields" });
  }

  const fakeSumupId = `DEMO-${Date.now()}`;

  // Save to Postgres
  try {
    await db`
      INSERT INTO bookings (
        tour_id, tour_name, customer_name, customer_email, customer_phone,
        passengers, booking_date, booking_time, total_price, payment_status, sumup_id, lang
      ) VALUES (
        ${metadata.tour || null},
        ${metadata.tourTitle || null},
        ${metadata.name || null},
        ${metadata.email || null},
        ${metadata.phone || null},
        ${metadata.qty || 1},
        ${metadata.date || null},
        ${metadata.time || null},
        ${metadata.total || 0},
        'PAID',
        ${fakeSumupId},
        ${metadata.lang || 'english'}
      )
      ON CONFLICT (sumup_id) DO NOTHING
    `;
    log("[DEMO] Saved to Postgres:", fakeSumupId);
  } catch (dbErr) {
    logError("[DEMO] Postgres error:", dbErr.message);
    // Non-fatal — continue to GAS
  }

  // Calculate group number for wine tour
  let groupNumber = null;
  if (metadata.tour === "book-wine") {
    try {
      const ACTIVE_STATUSES = ["PAID", "RESERVED", "PENDING"];
      const countResult = await db`
        SELECT COUNT(*) as group_count
        FROM bookings
        WHERE tour_id = 'book-wine'
          AND booking_date = ${metadata.date}
          AND booking_time = ${metadata.time}
          AND payment_status = ANY(${ACTIVE_STATUSES})
          AND sumup_id != ${fakeSumupId}
      `;
      const countRows = countResult.rows ?? countResult;
      groupNumber = Number(countRows[0]?.group_count || 0) + 1;
      log("[DEMO] Wine group number:", groupNumber);
    } catch (e) {
      warn("[DEMO] Could not calculate group number:", e.message);
    }
  }

  // Trigger GAS (demo AppScript) → calendar event + email
  if (GAS_DEMO_URL) {
    const gasPayload = {
      action: "createBooking",
      ...metadata,
      payment_status: "PAID",
      sumup_checkout_id: fakeSumupId,
      amount: Number(metadata.total) || 0,
      currency: "DKK",
      ...(groupNumber ? { groupNumber } : {})
    };
    log("[DEMO] Calling GAS:", GAS_DEMO_URL);
    log("[DEMO] GAS payload:", JSON.stringify(gasPayload));
    try {
      const gasResponse = await fetch(GAS_DEMO_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gasPayload)
      });
      const gasResult = await gasResponse.text();
      log("[DEMO] GAS status:", gasResponse.status);
      log("[DEMO] GAS result:", gasResult);
    } catch (gasErr) {
      logError("[DEMO] GAS error:", gasErr.message);
    }
  } else {
    warn("[DEMO] GAS_DEMO_URL not set — skipping calendar/email");
  }

  return res.status(200).json({ success: true, demo: true, sumup_id: fakeSumupId });
}
