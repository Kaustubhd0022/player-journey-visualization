import * as duckdb from '@duckdb/duckdb-wasm';
import * as arrow from 'apache-arrow';
import JSZip from 'jszip';
import { computeClientHeatmaps } from './clientHeatmap';

let db = null;
let conn = null;

const MAP_CONFIG = {
  'AmbroseValley': { origin_x: -370, origin_z: -473, scale: 900 },
  'GrandRift':     { origin_x: -290, origin_z: -290, scale: 581 },
  'Lockdown':      { origin_x: -500, origin_z: -500, scale: 1000 },
};

// No longer need MAP_ALIASES as normalizeMapName returns standard names

function normalizeMapName(name) {
  if (!name) return 'unknown';
  const clean = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Return standard names for use in UI/keys
  if (clean.includes('ambrose') || clean.includes('valley')) return 'AmbroseValley';
  if (clean.includes('grand') || clean.includes('rift')) return 'GrandRift';
  if (clean.includes('lock') || clean.includes('down')) return 'Lockdown';
  
  return clean; // Fallback to whatever name is provided but lowercase-ish
}

async function extractParquetFromZip(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const parquetFiles = [];
  
  zip.forEach((relativePath, zipEntry) => {
    console.log('ZIP entry found:', relativePath, 'isDir:', zipEntry.dir);
    
    if (!zipEntry.dir) {
      const lowerPath = relativePath.toLowerCase();
      
      // Ignore known junk files
      const isJunk = lowerPath.includes('.ds_store') || 
                     lowerPath.includes('__macosx') || 
                     lowerPath.endsWith('.txt') || 
                     lowerPath.endsWith('.md') ||
                     lowerPath.endsWith('.png') ||
                     lowerPath.endsWith('.jpg');

      if (!isJunk) {
        parquetFiles.push({ path: relativePath, entry: zipEntry });
      }
    }
  });
  
  console.log('Parquet files found in ZIP:', parquetFiles.map(f => f.path));
  
  if (parquetFiles.length === 0) {
    const allFiles = [];
    zip.forEach((path, entry) => { if (!entry.dir) allFiles.push(path); });
    console.error('No parquet files found. All files in ZIP:', allFiles);
    throw new Error(
      `No parquet files found in ZIP. Files present: ${allFiles.slice(0, 10).join(', ')}${allFiles.length > 10 ? ` ... and ${allFiles.length - 10} more` : ''}`
    );
  }
  
  const results = await Promise.all(
    parquetFiles.map(async ({ path, entry }) => {
      const buffer = await entry.async('arraybuffer');
      console.log(`Extracted: ${path} — ${buffer.byteLength} bytes`);
      return { name: path, buffer };
    })
  );
  
  return results;
}

async function parseParquetBuffer(buffer, fileName) {
  try {
    if (!db) await initDuckDB();
    
    const uint8 = new Uint8Array(buffer);
    await db.registerFileBuffer(fileName, uint8);
    
    const result = await conn.query(`SELECT * FROM read_parquet('${fileName}')`);
    return result.toArray().map(row => row.toJSON());
    
  } catch (duckdbError) {
    console.warn('DuckDB failed, trying Apache Arrow fallback:', duckdbError);
    
    try {
      const table = arrow.tableFromIPC(new Uint8Array(buffer));
      const rows = [];
      for (let i = 0; i < table.numRows; i++) {
        const row = {};
        for (const field of table.schema.fields) {
          row[field.name] = table.getChildAt(
            table.schema.fields.indexOf(field)
          )?.get(i);
        }
        rows.push(row);
      }
      return rows;
    } catch (arrowError) {
      console.error('Apache Arrow also failed:', arrowError);
      throw new Error(`Cannot parse ${fileName}: ${arrowError.message}`);
    }
  }
}

export async function processFiles(files, onProgress) {
  let allBuffers = [];
  
  onProgress(1, 'Reading files...');
  
  for (const file of files) {
    const name = file.name.toLowerCase();
    console.log('Processing file:', file.name, 'size:', file.size, 'type:', file.type);
    
    if (name.endsWith('.zip')) {
      onProgress(2, `Extracting ZIP: ${file.name}...`);
      try {
        const extracted = await extractParquetFromZip(file);
        allBuffers = allBuffers.concat(extracted);
      } catch (err) {
        throw new Error(`ZIP extraction failed: ${err.message}`);
      }
      
    } else if (name.endsWith('.parquet')) {
      const buffer = await file.arrayBuffer();
      allBuffers.push({ name: file.name, buffer });
      
    } else {
      console.warn('Unknown file extension, attempting parquet parse:', file.name);
      const buffer = await file.arrayBuffer();
      allBuffers.push({ name: file.name, buffer });
    }
  }
  
  if (allBuffers.length === 0) {
    throw new Error('No parquet files found. Make sure your ZIP contains .parquet files.');
  }
  
  onProgress(2, `Parsing ${allBuffers.length} parquet file(s)...`);
  
  const allRows = [];
  for (const { name, buffer } of allBuffers) {
    onProgress(2, `Parsing: ${name}`);
    const rows = await parseParquetBuffer(buffer, name);
    allRows.push(...rows);
  }
  
  if (allRows.length === 0) {
    throw new Error('Files parsed but contain no rows.');
  }
  
  onProgress(3, `Processing ${allRows.length.toLocaleString()} events...`);
  
  const sample = allRows[0];
  const required = ['user_id', 'ts', 'event', 'x', 'z'];
  const missing = required.filter(col => !(col in sample));
  if (missing.length > 0) {
    console.log('Available columns:', Object.keys(sample));
    throw new Error(
      `Missing required columns: ${missing.join(', ')}. ` +
      `Found columns: ${Object.keys(sample).join(', ')}`
    );
  }
  
  onProgress(3, 'Decoding event types...');
  const decoded = allRows.map(row => ({
    ...row,
    event: decodeEvent(row.event),
  }));
  
  onProgress(3, 'Detecting bots vs humans...');
  const withTypes = decoded.map(row => {
    const userId = String(row.user_id);
    // Bot if starts with 'BOT_' OR is a pure number (as seen in process.py)
    const isBot = userId.startsWith('BOT_') || /^\d+$/.test(userId);
    const playerType = isBot ? 'bot' : 'human';
    
    // Remap events to match the tool's expected categories (Human Kills vs Bot Kills)
    let event = row.event;
    if (isBot) {
      if (event === 'Kill') event = 'BotKill';
      if (event === 'Killed') event = 'BotKilled';
      if (event === 'Position') event = 'BotPosition';
    }

    return {
      ...row,
      match_id: String(row.match_id || 'unknown'),
      user_id: userId,
      player_type: playerType,
      is_bot: isBot,
      event: event,
      ts: Number(row.ts),
      map: normalizeMapName(row.map || row.map_id) // Standardize map names
    };
  });
  
  const mapNames = [...new Set(withTypes.map(r => r.map).filter(m => m && m !== 'unknown'))];
  const finalMapNames = mapNames.length > 0 ? mapNames : ['Uploaded Map'];
  
  onProgress(4, 'Mapping coordinates...');
  const withPixels = withTypes.map(row => {
    const mapName = row.map || finalMapNames[0] || 'Unknown';
    const { px, py } = worldToPixel(row.x, row.z, mapName);
    return { ...row, px, py, map_name: mapName };
  });
  
  onProgress(5, 'Optimizing paths...');
  const decimated = decimatePaths(withPixels);
  
  onProgress(6, 'Computing heatmaps...');
  const heatmapsByMap = {};
  for (const mName of finalMapNames) {
    onProgress(6, `Computing heatmaps for ${mName}...`);
    const mapEvents = withPixels.filter(e => (e.map === mName || e.map_name === mName || (!e.map && mName === 'Uploaded Map')));
    heatmapsByMap[mName] = computeClientHeatmaps(mapEvents);
  }
  
  const matchIds = [...new Set(decimated.map(r => r.match_id).filter(Boolean))].sort();
  const dates = ["Uploaded Data"];
  
  onProgress(6, `Ready — ${decimated.length.toLocaleString()} events, ${matchIds.length} matches`);
  
  return {
    events: decimated,
    matches: matchIds,
    dates: dates,
    maps: finalMapNames,
    heatmaps: heatmapsByMap,
    mapConfigs: {},
    isUploaded: true,
  };
}

function decodeEvent(value) {
  if (value == null) return 'Unknown';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return new TextDecoder().decode(value);
  }
  if (Array.isArray(value)) {
    return new TextDecoder().decode(new Uint8Array(value));
  }
  if (typeof value === 'object' && value.buffer) {
    return new TextDecoder().decode(value);
  }
  return String(value);
}

function worldToPixel(x, z, mapName) {
  const normName = normalizeMapName(mapName);
  const config = MAP_CONFIG[normName];
  if (!config) return { px: 0, py: 0 };
  
  let px = (x - config.origin_x) / config.scale * 1024;
  let py = (1 - (z - config.origin_z) / config.scale) * 1024;
  
  px = Math.round(Math.max(0, Math.min(1024, px)) * 10) / 10;
  py = Math.round(Math.max(0, Math.min(1024, py)) * 10) / 10;
  
  return { px, py };
}

function decimatePaths(events) {
  const MAX_POS_PER_PLAYER = 100;
  const groups = {};
  const others = [];

  for (const e of events) {
    if (e.event === 'Position' || e.event === 'BotPosition') {
      const key = `${e.match_id}_${e.user_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    } else {
      others.push(e);
    }
  }

  const decimated = [];
  for (const key in groups) {
    const group = groups[key].sort((a, b) => a.ts - b.ts);
    const step = Math.max(1, Math.floor(group.length / MAX_POS_PER_PLAYER));
    for (let i = 0; i < group.length; i += step) {
      decimated.push(group[i]);
    }
  }

  return [...decimated, ...others];
}

async function initDuckDB() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
  );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
}
