import axios from 'axios';
import { pool } from '../db/index.js';

async function getSentinelToken(): Promise<string> {
  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('COPERNICUS_CLIENT_ID or COPERNICUS_CLIENT_SECRET is missing in environment variables.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  const res = await axios.post(
    'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return res.data.access_token;
}

export async function ingestSentinelProducts() {
  try {
    const sourceRes = await pool.query(
  "SELECT id FROM data_sources WHERE source_code IN ('SENTINEL-1', 'SENTINEL', 'SENTINEL1', 'COPERNICUS')"
);
    
    if (sourceRes.rowCount === 0) {
      throw new Error("Sentinel source missing from data_sources. Ensure 'SENTINEL-1' exists in data_sources table.");
    }
    const sourceId = sourceRes.rows[0].id;

    const token = await getSentinelToken();

    // Polygon bounding box covering NER / Brahmaputra basin
    const wktPolygon = "POLYGON((89.8 24.5, 96.0 24.5, 96.0 28.2, 89.8 28.2, 89.8 24.5))";
    const filter = `Collection/Name eq 'SENTINEL-1' and OData.CSC.Intersects(area=geography'SRID=4326;${wktPolygon}')`;

    const url = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=${encodeURIComponent(filter)}&$top=100&$orderby=ContentDate/Start desc`;

    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const products = data.value || [];
    let ingestedCount = 0;

    for (const prod of products) {
      const externalId = prod.Id;
      const acquiredAt = prod.ContentDate?.Start || null;
      const processedAt = prod.PublicationDate || null;
      const s3Path = prod.S3Path || null;
      const productType = prod.Attributes?.find((a: any) => a.Name === 'productType')?.Value || 'GRD';

      await pool.query(
        `INSERT INTO satellite_products (
           source_id, external_product_id, satellite, instrument, product_type,
           acquired_at, processed_at, asset_url, metadata
         ) VALUES ($1, $2, 'Sentinel-1', 'SAR-C', $3, $4, $5, $6, $7)
         ON CONFLICT (external_product_id) DO NOTHING`,
        [sourceId, externalId, productType, acquiredAt, processedAt, s3Path, JSON.stringify(prod)]
      );

      ingestedCount++;
    }

    return { success: true, ingested: ingestedCount, totalQueried: products.length };
  } catch (err: any) {
    console.error('Sentinel Ingestion Error:', err.message);
    return { success: false, error: err.message };
  }
}