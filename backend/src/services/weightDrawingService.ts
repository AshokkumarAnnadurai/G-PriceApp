import fs from 'fs';
import path from 'path';
import { query } from '../db/pool';
import { logger } from '../middleware/logger';

interface DrawingSlot {
  id: string;
  url: string;
  weight: number;
}

export async function getWeightDrawings(itemCode: string): Promise<any[]> {
  const sql = `
    SELECT id, item_code, category, slot_index, weight, image_path
    FROM item_weight_attachments
    WHERE TRIM(item_code) = TRIM($1)
    ORDER BY category, slot_index;
  `;
  return query<any>(sql, [itemCode]);
}

export async function saveWeightDrawings(itemCode: string, category: string, slots: DrawingSlot[]): Promise<void> {
  const uploadDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    let imagePath: string | null = null;

    if (slot.url) {
      if (slot.url.startsWith('data:image/')) {
        // Base64 file upload
        const matches = slot.url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1].split('/')[1] || 'png';
          const buffer = Buffer.from(matches[2], 'base64');
          
          const cleanItemCode = itemCode.replace(/[^a-zA-Z0-9-_]/g, '_');
          const cleanCategory = category.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9-_]/g, '');
          const filename = `${cleanItemCode}_${cleanCategory}_slot_${index + 1}_${Date.now()}.${ext}`;
          const filepath = path.join(uploadDir, filename);
          
          fs.writeFileSync(filepath, buffer);
          imagePath = `/uploads/${filename}`;
          logger.info(`Saved blueprint file: ${filepath}`);
        } else {
          throw new Error('Invalid base64 image data');
        }
      } else if (slot.url.startsWith('/uploads/')) {
        // Keep existing drawing URL
        imagePath = slot.url;
      }
    }

    // Upsert query for (item_code, category, slot_index)
    const upsertSql = `
      INSERT INTO item_weight_attachments (item_code, category, slot_index, weight, image_path, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (item_code, category, slot_index)
      DO UPDATE SET 
        weight = EXCLUDED.weight,
        image_path = EXCLUDED.image_path,
        updated_at = NOW();
    `;
    await query(upsertSql, [itemCode, category, index, slot.weight, imagePath]);
  }
}
