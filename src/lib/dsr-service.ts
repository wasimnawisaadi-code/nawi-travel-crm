// DSR (Daily Status Report) service — templates, assignments, entries, Excel ingest
import { supabase } from '@/integrations/supabase/client';
import { generateDisplayId } from './supabase-service';
import * as XLSX from 'xlsx';

export type DSRColumn = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required?: boolean;
  options?: string[];
  financial?: 'sale' | 'cost' | 'profit';
};

export type DSRTemplate = {
  id: string;
  template_key: string;
  name: string;
  icon: string;
  description: string | null;
  columns: DSRColumn[];
  is_active: boolean;
};

export type DSREntry = {
  id: string;
  display_id: string;
  template_id: string;
  template_key: string;
  employee_id: string;
  employee_name: string | null;
  entry_date: string;
  data: Record<string, any>;
  sale_amount: number;
  cost_amount: number;
  profit_amount: number;
  source: 'manual' | 'excel';
  created_at: string;
};

export async function fetchAllTemplates(): Promise<DSRTemplate[]> {
  const { data, error } = await supabase
    .from('dsr_templates')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data || []) as any;
}

export async function fetchAssignedTemplates(employeeId: string): Promise<DSRTemplate[]> {
  const { data: assignments } = await supabase
    .from('dsr_assignments')
    .select('template_id')
    .eq('employee_id', employeeId);
  const ids = (assignments || []).map((a: any) => a.template_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('dsr_templates')
    .select('*')
    .in('id', ids)
    .eq('is_active', true);
  return (data || []) as any;
}

export async function fetchAssignmentMap(): Promise<Record<string, string[]>> {
  // returns { template_id: [employee_id, ...] }
  const { data } = await supabase.from('dsr_assignments').select('template_id, employee_id');
  const map: Record<string, string[]> = {};
  (data || []).forEach((a: any) => {
    if (!map[a.template_id]) map[a.template_id] = [];
    map[a.template_id].push(a.employee_id);
  });
  return map;
}

export async function setAssignments(templateId: string, employeeIds: string[], assignedBy: string) {
  // Replace assignments for a template
  await supabase.from('dsr_assignments').delete().eq('template_id', templateId);
  if (employeeIds.length === 0) return;
  const rows = employeeIds.map(eid => ({ template_id: templateId, employee_id: eid, assigned_by: assignedBy }));
  const { error } = await supabase.from('dsr_assignments').insert(rows);
  if (error) throw error;
}

function computeFinancials(template: DSRTemplate, data: Record<string, any>) {
  let sale = 0, cost = 0, profit = 0;
  for (const col of template.columns) {
    if (!col.financial) continue;
    const v = parseFloat(data[col.key]);
    if (isNaN(v)) continue;
    if (col.financial === 'sale') sale = v;
    else if (col.financial === 'cost') cost = v;
    else if (col.financial === 'profit') profit = v;
  }
  if (!profit && (sale || cost)) profit = sale - cost;
  return { sale, cost, profit };
}

export async function createEntry(
  template: DSRTemplate,
  employeeId: string,
  employeeName: string,
  entryDate: string,
  data: Record<string, any>,
  source: 'manual' | 'excel' = 'manual'
) {
  const display_id = await generateDisplayId('DSR');
  const { sale, cost, profit } = computeFinancials(template, data);
  const { error } = await supabase.from('dsr_entries').insert({
    display_id,
    template_id: template.id,
    template_key: template.template_key,
    employee_id: employeeId,
    employee_name: employeeName,
    entry_date: entryDate,
    data,
    sale_amount: sale,
    cost_amount: cost,
    profit_amount: profit,
    source,
  });
  if (error) throw error;
}

export async function bulkCreateEntries(
  template: DSRTemplate,
  employeeId: string,
  employeeName: string,
  entryDate: string,
  rows: Record<string, any>[]
) {
  const inserts = await Promise.all(rows.map(async (row) => {
    const display_id = await generateDisplayId('DSR');
    const { sale, cost, profit } = computeFinancials(template, row);
    return {
      display_id,
      template_id: template.id,
      template_key: template.template_key,
      employee_id: employeeId,
      employee_name: employeeName,
      entry_date: entryDate,
      data: row,
      sale_amount: sale,
      cost_amount: cost,
      profit_amount: profit,
      source: 'excel' as const,
    };
  }));
  const { error } = await supabase.from('dsr_entries').insert(inserts);
  if (error) throw error;
  return inserts.length;
}

export async function updateEntry(entryId: string, template: DSRTemplate, data: Record<string, any>) {
  const { sale, cost, profit } = computeFinancials(template, data);
  const { error } = await supabase
    .from('dsr_entries')
    .update({ data, sale_amount: sale, cost_amount: cost, profit_amount: profit })
    .eq('id', entryId);
  if (error) throw error;
}

export async function deleteEntry(entryId: string) {
  const { error } = await supabase.from('dsr_entries').delete().eq('id', entryId);
  if (error) throw error;
}

export async function fetchEntries(filters: {
  templateId?: string;
  employeeId?: string;
  fromDate?: string;
  toDate?: string;
  isAdmin?: boolean;
  currentUserId?: string;
}): Promise<DSREntry[]> {
  let q = supabase.from('dsr_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (filters.templateId) q = q.eq('template_id', filters.templateId);
  if (filters.employeeId) q = q.eq('employee_id', filters.employeeId);
  if (filters.fromDate) q = q.gte('entry_date', filters.fromDate);
  if (filters.toDate) q = q.lte('entry_date', filters.toDate);
  if (!filters.isAdmin && filters.currentUserId) q = q.eq('employee_id', filters.currentUserId);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data || []) as any;
}

// =================== EXCEL PARSING & COLUMN DETECTION ===================
function normalize(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type ExcelParseResult = {
  ok: boolean;
  reason?: string;
  matchedColumns?: { excelHeader: string; key: string; label: string }[];
  unmatchedHeaders?: string[];
  missingRequired?: string[];
  rows?: Record<string, any>[];
};

/**
 * Parse Excel/CSV file against template. Auto-detect column mapping.
 * Reject if required columns missing or match rate is too low.
 */
export async function parseExcelForTemplate(file: File, template: DSRTemplate): Promise<ExcelParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, reason: 'Workbook has no sheets' };
  const sheet = wb.Sheets[sheetName];
  const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (json.length < 2) return { ok: false, reason: 'File needs a header row and at least one data row' };

  const headers = (json[0] as any[]).map(h => String(h ?? '').trim());
  if (headers.every(h => !h)) return { ok: false, reason: 'No header row detected' };

  // Build lookup from normalized header → column def
  const colByNorm = new Map<string, DSRColumn>();
  template.columns.forEach(c => {
    colByNorm.set(normalize(c.label), c);
    colByNorm.set(normalize(c.key), c);
  });

  const matched: { excelHeader: string; key: string; label: string; idx: number }[] = [];
  const unmatched: string[] = [];
  headers.forEach((h, i) => {
    if (!h) return;
    const norm = normalize(h);
    let col = colByNorm.get(norm);
    // fuzzy: try contains match
    if (!col) {
      for (const [k, v] of colByNorm) {
        if (k.length >= 4 && (k.includes(norm) || norm.includes(k))) { col = v; break; }
      }
    }
    if (col) matched.push({ excelHeader: h, key: col.key, label: col.label, idx: i });
    else unmatched.push(h);
  });

  // Validate required columns present
  const requiredKeys = template.columns.filter(c => c.required).map(c => c.key);
  const matchedKeys = new Set(matched.map(m => m.key));
  const missingRequired = requiredKeys.filter(k => !matchedKeys.has(k));

  // Reject if no meaningful match or required columns missing
  const matchRate = headers.filter(Boolean).length > 0 ? matched.length / headers.filter(Boolean).length : 0;
  if (matched.length === 0) {
    return { ok: false, reason: 'No columns in your file match this template. Please use the template format.', unmatchedHeaders: unmatched };
  }
  if (missingRequired.length > 0) {
    return {
      ok: false,
      reason: `Required column(s) missing: ${missingRequired.join(', ')}`,
      missingRequired,
      matchedColumns: matched.map(({ excelHeader, key, label }) => ({ excelHeader, key, label })),
      unmatchedHeaders: unmatched,
    };
  }
  if (matchRate < 0.4) {
    return {
      ok: false,
      reason: `Only ${Math.round(matchRate * 100)}% of columns matched the template. Please check your file format.`,
      matchedColumns: matched.map(({ excelHeader, key, label }) => ({ excelHeader, key, label })),
      unmatchedHeaders: unmatched,
    };
  }

  // Build rows
  const rows: Record<string, any>[] = [];
  for (let r = 1; r < json.length; r++) {
    const rawRow = json[r] as any[];
    if (!rawRow || rawRow.every(v => v === '' || v == null)) continue;
    const row: Record<string, any> = {};
    matched.forEach(m => {
      const val = rawRow[m.idx];
      if (val instanceof Date) row[m.key] = val.toISOString().split('T')[0];
      else row[m.key] = val == null ? '' : String(val).trim();
    });
    // Skip if required field is empty in this row
    const hasRequired = requiredKeys.every(k => row[k] && String(row[k]).trim() !== '');
    if (hasRequired) rows.push(row);
  }

  if (rows.length === 0) {
    return { ok: false, reason: 'No valid data rows found (required fields are empty)' };
  }

  return {
    ok: true,
    matchedColumns: matched.map(({ excelHeader, key, label }) => ({ excelHeader, key, label })),
    unmatchedHeaders: unmatched,
    rows,
  };
}

/** Generate downloadable Excel template for a DSR type */
export function downloadTemplateExcel(template: DSRTemplate) {
  const headers = template.columns.map(c => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.template_key.slice(0, 30));
  XLSX.writeFile(wb, `${template.template_key}_template.xlsx`);
}

/** Export entries to Excel */
export function exportEntriesToExcel(template: DSRTemplate, entries: DSREntry[]) {
  const headers = ['Display ID', 'Date', 'Employee', ...template.columns.map(c => c.label)];
  const rows = entries.map(e => [
    e.display_id,
    e.entry_date,
    e.employee_name || '',
    ...template.columns.map(c => e.data[c.key] ?? ''),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, template.name.slice(0, 30));
  XLSX.writeFile(wb, `${template.template_key}_export_${new Date().toISOString().split('T')[0]}.xlsx`);
}
