import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { pool } from '../db/index.js';

const RSS_URL = 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
const parser = new XMLParser({ ignoreAttributes: false });

function mapHazardType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('flood')) return 'flood';
  if (lower.includes('rain') || lower.includes('downpour')) return 'rainfall';
  if (lower.includes('landslide')) return 'landslide';
  if (lower.includes('avalanche')) return 'avalanche';
  if (lower.includes('earthquake')) return 'earthquake';
  return 'unknown';
}

export async function ingestSachetFeed() {
  try {
    const sourceRes = await pool.query("SELECT id FROM data_sources WHERE source_code = 'SACHET'");
    if (sourceRes.rowCount === 0) throw new Error("SACHET missing from data_sources");
    const sourceId = sourceRes.rows[0].id;

    const { data: xml } = await axios.get(RSS_URL);
    const parsed = parser.parse(xml);
    
    const rawItems = parsed?.rss?.channel?.item;
    const items: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    let ingestedCount = 0;
    let eventsCount = 0;

    for (const item of items) {
      const rawExternalId = String(item.guid?.['#text'] || item.guid || item.link || `sachet-${Date.now()}`);
      const externalId = rawExternalId.slice(0, 250);

      const exists = await pool.query(
        "SELECT id FROM feed_ingestions WHERE external_record_id = $1 AND source_id = $2",
        [externalId, sourceId]
      );

      let ingestionId: string;

      if (exists.rowCount && exists.rowCount > 0) {
        ingestionId = exists.rows[0].id;
      } else {
        const insertRes = await pool.query(
          `INSERT INTO feed_ingestions (source_id, external_record_id, content_type, processing_status, raw_payload)
           VALUES ($1, $2, 'application/cap+xml', 'processed', $3)
           RETURNING id`,
          [sourceId, externalId, JSON.stringify(item)]
        );
        ingestionId = insertRes.rows[0].id;
        ingestedCount++;
      }

      const eventCode = `SACHET-${externalId}`.slice(0, 90);
      const eventExists = await pool.query("SELECT id FROM events WHERE event_code = $1", [eventCode]);

      if (eventExists.rowCount === 0) {
        const rawTitle = item.title || 'SACHET Disaster Alert';
        const title = rawTitle.slice(0, 290);
        const description = item.description || title;
        const hazardType = mapHazardType(title);

        const eventRes = await pool.query(
          `INSERT INTO events (event_code, hazard_type, title, description, confidence_level, status)
           VALUES ($1, $2, $3, $4, 'suspected', 'monitoring')
           RETURNING id`,
          [eventCode, hazardType, title, description]
        );
        const eventId = eventRes.rows[0].id;

        await pool.query(
          `INSERT INTO event_observations (event_id, source_id, feed_ingestion_id, observation_type, is_supporting_evidence)
           VALUES ($1, $2, $3, 'cap_alert', true)`,
          [eventId, sourceId, ingestionId]
        );
        eventsCount++;
      }
    }
    return { success: true, ingested: ingestedCount, eventsCreated: eventsCount };
  } catch (err: any) {
    console.error('SACHET Error:', err.message);
    return { success: false, error: err.message };
  }
}