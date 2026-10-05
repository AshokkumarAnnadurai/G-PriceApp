import fs from 'fs';
import path from 'path';
import { query } from '../db/pool';
import { logger } from '../middleware/logger';

interface DrawingSlot {
  id: string;
  url: string;
  weight: number;
}

let isMigrated = false;

async function ensureMigration(): Promise<void> {
  if (isMigrated) return;
  try {
    await query('ALTER TABLE vendor_weight_attachments ADD COLUMN IF NOT EXISTS quarter VARCHAR(10)');
    await query('ALTER TABLE vendor_weight_attachments ADD COLUMN IF NOT EXISTS year INTEGER');
    
    await query(`
      UPDATE vendor_weight_attachments a
      SET 
        quarter = CASE 
          WHEN EXTRACT(MONTH FROM m.from_date) BETWEEN 1 AND 3 THEN 'Q1'
          WHEN EXTRACT(MONTH FROM m.from_date) BETWEEN 4 AND 6 THEN 'Q2'
          WHEN EXTRACT(MONTH FROM m.from_date) BETWEEN 7 AND 9 THEN 'Q3'
          ELSE 'Q4'
        END,
        year = EXTRACT(YEAR FROM m.from_date)::integer
      FROM vendor_materials m
      WHERE a.material_id = m.id AND a.quarter IS NULL;
    `);

    try {
      await query('ALTER TABLE vendor_weight_attachments DROP CONSTRAINT IF EXISTS vendor_weight_attachments_vendor_id_material_id_category_slot_key');
      await query('ALTER TABLE vendor_weight_attachments DROP CONSTRAINT IF EXISTS vendor_weight_attachments_vendor_id_material_id_category_slot_index_key');
      await query('ALTER TABLE vendor_weight_attachments DROP CONSTRAINT IF EXISTS vendor_weight_attachments_vendor_id_material_id_category_sl_key');
    } catch (e) {
      logger.debug('[runVendorWeightAttachmentsMigration] Legacy constraint drop notice:', e);
    }

    await query('CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_weight_attachments_unique ON vendor_weight_attachments (vendor_id, material_id, category, slot_index, quarter, year)');
    isMigrated = true;
  } catch (err) {
    logger.error('Failed to run vendor_weight_attachments migration:', err);
  }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_TO_QUARTER: Record<string, string> = {
  'Jan': 'Q1', 'Feb': 'Q1', 'Mar': 'Q1',
  'Apr': 'Q2', 'May': 'Q2', 'Jun': 'Q2',
  'Jul': 'Q3', 'Aug': 'Q3', 'Sep': 'Q3',
  'Oct': 'Q4', 'Nov': 'Q4', 'Dec': 'Q4'
};

function resolveQuarterOrMonth(fromDateStr: string | null | undefined, toDateStr: string | null | undefined): { quarter: string; year: number } {
  if (!fromDateStr) {
    return { quarter: 'Q1', year: 2026 };
  }
  const fromDate = new Date(fromDateStr);
  const year = fromDate.getFullYear();
  
  if (toDateStr) {
    const toDate = new Date(toDateStr);
    const isSameMonth = fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear();
    const diffDays = Math.ceil(Math.abs(toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (isSameMonth || diffDays <= 31) {
      return {
        quarter: MONTH_NAMES[fromDate.getMonth()],
        year
      };
    }
  }
  
  const q = Math.floor(fromDate.getMonth() / 3) + 1;
  return {
    quarter: `Q${q}`,
    year
  };
}

async function resolveActiveMaterial(materialId: number): Promise<{ activeId: number; quarter: string; year: number }> {
  let matRes = await query<any>(
    'SELECT id, from_date, to_date FROM vendor_materials WHERE id = $1',
    [materialId]
  );
  if (matRes.length > 0) {
    const { quarter, year } = resolveQuarterOrMonth(matRes[0].from_date, matRes[0].to_date);
    return {
      activeId: matRes[0].id,
      quarter,
      year
    };
  }

  const histRes = await query<any>(
    'SELECT vendor_id, item_code, grade, customer_name, casting_code, machine_type, from_date, to_date FROM vendor_materials_history WHERE id = $1',
    [materialId]
  );
  if (histRes.length === 0) {
    throw new Error(`Material not found for ID: ${materialId}`);
  }
  const hist = histRes[0];
  const { quarter, year } = resolveQuarterOrMonth(hist.from_date, hist.to_date);

  let activeRes: any[] = [];
  if (hist.item_code) {
    activeRes = await query<any>(
      'SELECT id FROM vendor_materials WHERE TRIM(vendor_id) = TRIM($1) AND TRIM(item_code) = TRIM($2)',
      [hist.vendor_id, hist.item_code]
    );
  } else {
    activeRes = await query<any>(
      `SELECT id FROM vendor_materials 
       WHERE TRIM(vendor_id) = TRIM($1) 
         AND TRIM(grade) = TRIM($2) 
         AND TRIM(customer_name) = TRIM($3) 
         AND TRIM(casting_code) = TRIM($4)
         AND COALESCE(TRIM(machine_type), '') = COALESCE(TRIM($5), '')`,
      [hist.vendor_id, hist.grade, hist.customer_name, hist.casting_code, hist.machine_type]
    );
  }

  if (activeRes.length > 0) {
    return {
      activeId: activeRes[0].id,
      quarter,
      year
    };
  }

  return {
    activeId: materialId,
    quarter,
    year
  };
}

export async function getVendorWeightDrawings(
  vendorId: string,
  materialId: number,
  quarter?: string,
  year?: number
): Promise<any[]> {
  await ensureMigration();
  
  const { activeId, quarter: defaultQuarter, year: defaultYear } = await resolveActiveMaterial(materialId);
  const q = quarter || defaultQuarter;
  const y = year ? Number(year) : defaultYear;

  const sql = `
    SELECT id, vendor_id, material_id, category, slot_index, weight, image_path, quarter, year
    FROM vendor_weight_attachments
    WHERE TRIM(vendor_id) = TRIM($1) AND material_id = $2 AND quarter = $3 AND year = $4
    ORDER BY category, slot_index;
  `;
  let result = await query<any>(sql, [vendorId, activeId, q, y]);

  // Fallback to quarter-wide drawing if month-specific drawing is missing
  if (result.length === 0 && MONTH_TO_QUARTER[q]) {
    const fallbackQ = MONTH_TO_QUARTER[q];
    result = await query<any>(sql, [vendorId, activeId, fallbackQ, y]);
  }
  return result;
}

export async function saveVendorWeightDrawings(
  vendorId: string,
  materialId: number,
  category: string,
  slots: DrawingSlot[],
  quarter?: string,
  year?: number
): Promise<void> {
  await ensureMigration();
  
  const { activeId, quarter: defaultQuarter, year: defaultYear } = await resolveActiveMaterial(materialId);
  const q = quarter || defaultQuarter;
  const y = year ? Number(year) : defaultYear;

  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    if (slot.weight != null && Number(slot.weight) < 0) {
      throw new Error('Negative weight is not allowed');
    }
    let imagePath: string | null = null;

    if (slot.url) {
      if (slot.url.startsWith('data:image/')) {
        const matches = slot.url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1].split('/')[1] || 'png';
          const buffer = Buffer.from(matches[2], 'base64');

          const cleanVendorId = vendorId.replace(/[^a-zA-Z0-9-_]/g, '_');
          const cleanCategory = category.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_]/g, '');
          const filename = `vendor_${cleanVendorId}_mat${activeId}_${cleanCategory}_slot_${index + 1}_${Date.now()}.${ext}`;
          const filepath = path.join(uploadDir, filename);

          fs.writeFileSync(filepath, buffer);
          imagePath = `/uploads/${filename}`;
          logger.info(`Saved vendor blueprint file: ${filepath}`);
        } else {
          throw new Error('Invalid base64 image data');
        }
      } else if (slot.url.startsWith('/uploads/')) {
        imagePath = slot.url;
      }
    }

    const upsertSql = `
      INSERT INTO vendor_weight_attachments (vendor_id, material_id, category, slot_index, weight, image_path, quarter, year, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (vendor_id, material_id, category, slot_index, quarter, year)
      DO UPDATE SET
        weight = EXCLUDED.weight,
        image_path = EXCLUDED.image_path,
        updated_at = NOW();
    `;
    await query(upsertSql, [vendorId, activeId, category, index, slot.weight, imagePath, q, y]);
  }
}

export async function getMaterialPeriods(vendorId: string, materialId: number): Promise<any[]> {
  await ensureMigration();
  
  let matRes = await query<any>(
    'SELECT item_code, grade, customer_name, casting_code, machine_type FROM vendor_materials WHERE id = $1',
    [materialId]
  );
  if (matRes.length === 0) {
    matRes = await query<any>(
      'SELECT item_code, grade, customer_name, casting_code, machine_type FROM vendor_materials_history WHERE id = $1',
      [materialId]
    );
  }
  if (matRes.length === 0) return [];
  const mat = matRes[0];

  const activeSql = `
    SELECT id, from_date, to_date, rm_weight, 'active' as type, created_at
    FROM vendor_materials
    WHERE TRIM(vendor_id) = TRIM($1)
      AND (
        (item_code IS NOT NULL AND TRIM(item_code) = TRIM($2))
        OR (
          TRIM(grade) = TRIM($3) 
          AND TRIM(customer_name) = TRIM($4) 
          AND TRIM(casting_code) = TRIM($5) 
          AND COALESCE(TRIM(machine_type), '') = COALESCE(TRIM($6), '')
        )
      )
  `;

  const historySql = `
    SELECT id, from_date, to_date, new_rm_weight as rm_weight, 'history' as type, changed_at as created_at
    FROM vendor_materials_history
    WHERE TRIM(vendor_id) = TRIM($1)
      AND (
        (item_code IS NOT NULL AND TRIM(item_code) = TRIM($2))
        OR (
          TRIM(grade) = TRIM($3) 
          AND TRIM(customer_name) = TRIM($4) 
          AND TRIM(casting_code) = TRIM($5) 
          AND COALESCE(TRIM(machine_type), '') = COALESCE(TRIM($6), '')
        )
      )
  `;

  const params = [
    vendorId,
    mat.item_code || '',
    mat.grade,
    mat.customer_name,
    mat.casting_code,
    mat.machine_type
  ];

  const { activeId } = await resolveActiveMaterial(materialId);

  const activeRes = await query<any>(activeSql, params);
  const historyRes = await query<any>(historySql, params);
  const periods = [...activeRes, ...historyRes];

  const counts = await query<{ quarter: string; year: number; count: string }>(
    `SELECT quarter, year, COUNT(*) as count 
     FROM vendor_weight_attachments 
     WHERE material_id = $1 AND image_path IS NOT NULL AND image_path <> ''
     GROUP BY quarter, year`,
    [activeId]
  );

  const countMap = new Map<string, number>();
  counts.forEach(row => {
    countMap.set(`${row.year}-${row.quarter}`, parseInt(row.count, 10));
  });

  // Deduplicate quarters
  const uniquePeriodsMap = new Map<string, any>();
  for (const p of periods) {
    if (!p.from_date) continue; // Skip legacy log rows without valid dates

    const { quarter: resolvedQ, year: resolvedY } = resolveQuarterOrMonth(p.from_date, p.to_date);
    const key = `${resolvedY}-${resolvedQ}`;

    const existing = uniquePeriodsMap.get(key);
    if (!existing) {
      uniquePeriodsMap.set(key, p);
    } else {
      const keepNew = 
        p.id === materialId ||
        (p.type === 'active' && existing.type !== 'active') ||
        (p.type === existing.type && p.id > existing.id);
      if (keepNew) {
        uniquePeriodsMap.set(key, p);
      }
    }
  }

  const dedupedPeriods = Array.from(uniquePeriodsMap.values());

  const periodsWithAttachmentFlag = dedupedPeriods.map((p: any) => {
    const { quarter: resolvedQ, year: resolvedY } = resolveQuarterOrMonth(p.from_date, p.to_date);
    const hasAttachments = (countMap.get(`${resolvedY}-${resolvedQ}`) || 0) > 0;

    return {
      id: p.id,
      fromDate: p.from_date,
      toDate: p.to_date,
      rmWeight: p.rm_weight,
      hasAttachments
    };
  });

  // Re-sort the final list by date descending
  periodsWithAttachmentFlag.sort((a, b) => {
    const timeA = new Date(a.fromDate).getTime();
    const timeB = new Date(b.fromDate).getTime();
    return timeB - timeA;
  });

  return periodsWithAttachmentFlag;
}
