// Server-only audit writer. Uses service role so it bypasses RLS
// (client ActivityLog.create/update/delete is denied at the data layer).
export async function writeAudit(base44, entry) {
  try {
    await base44.asServiceRole.entities.ActivityLog.create({
      action: entry.action,
      module: entry.module,
      record_id: entry.record_id || "",
      previous_value: entry.previous_value ? JSON.stringify(entry.previous_value).slice(0, 2000) : "",
      new_value: entry.new_value ? JSON.stringify(entry.new_value).slice(0, 2000) : "",
      reason: entry.reason || "",
      user_id: entry.user_id || "",
      user_name: entry.user_name || "system",
      user_role: entry.user_role || "",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Audit write failed:", e?.message || e);
  }
}
