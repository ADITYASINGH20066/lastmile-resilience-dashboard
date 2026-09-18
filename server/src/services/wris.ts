import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { pool } from '../db/index.js';

interface WrisRow {
  station_code: string;
  station_name: string;
  river_name: string;
  basin_name: string;
  latitude: string;
  longitude: string;
  warning_level: string;
  danger_level: string;
  water_level: string;
  discharge_rate: string;
  reading_timestamp: string;
}

export interface WrisIngestResult {
  success: boolean;
  stations?: number;
  readings?: number;
  error?: string;
}

export async function ingestWrisCsv(filePath?: string): Promise<WrisIngestResult> {
  const targetPath = filePath || path.resolve(process.cwd(), 'data/wris_sample.csv');

  if (!fs.existsSync(targetPath)) {
    return { success: false, error: `CSV file not found at ${targetPath}` };
  }

  const results: WrisRow[] = [];

  return new Promise<WrisIngestResult>((resolve) => {
    fs.createReadStream(targetPath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        let stationsProcessed = 0;
        let readingsProcessed = 0;

        try {
          const sourceRes = await pool.query(
            "SELECT id FROM data_sources WHERE source_code IN ('CWC', 'INDIA-WRIS', 'WRIS')"
          );
          let sourceId = sourceRes.rows[0]?.id;

          if (!sourceId) {
            const newSource = await pool.query(
              `INSERT INTO data_sources (source_code, source_name, source_type)
               VALUES ('CWC', 'Central Water Commission / India-WRIS', 'hydrological')
               RETURNING id`
            );
            sourceId = newSource.rows[0].id;
          }

          for (const row of results) {
            const stationRes = await pool.query(
              `INSERT INTO hydro_stations 
                 (station_code, station_name, river_name, basin_name, latitude, longitude, warning_level, danger_level)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (station_code) DO UPDATE SET
                 warning_level = EXCLUDED.warning_level,
                 danger_level = EXCLUDED.danger_level
               RETURNING id`,
              [
                row.station_code,
                row.station_name,
                row.river_name || null,
                row.basin_name || null,
                parseFloat(row.latitude),
                parseFloat(row.longitude),
                row.warning_level ? parseFloat(row.warning_level) : null,
                row.danger_level ? parseFloat(row.danger_level) : null,
              ]
            );

            const stationId = stationRes.rows[0].id;
            stationsProcessed++;

            await pool.query(
              `INSERT INTO hydro_readings 
                 (station_id, source_id, water_level, discharge_rate, reading_timestamp)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                stationId,
                sourceId,
                parseFloat(row.water_level),
                row.discharge_rate ? parseFloat(row.discharge_rate) : null,
                row.reading_timestamp,
              ]
            );
            readingsProcessed++;
          }

          resolve({ success: true, stations: stationsProcessed, readings: readingsProcessed });
        } catch (err: any) {
          console.error('WRIS Ingestion Error:', err.message);
          resolve({ success: false, error: err.message });
        }
      });
  });
}