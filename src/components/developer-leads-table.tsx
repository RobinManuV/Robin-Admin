// Admin interface component for developer leads table; composed by the shell or a feature module.
"use client";

import { useCallback, useEffect, useState } from "react";
import { portalClient } from "@/services/portal";

type Row = Record<string, unknown>;
type Editing = { id: string; column: string; original: unknown; text: string };

function display(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseValue(text: string, original: unknown) {
  if (text === "NULL") return null;
  if (text.startsWith("JSON:")) return JSON.parse(text.slice(5));
  if (typeof original === "boolean") {
    if (text !== "true" && text !== "false") throw new Error("Escribe true o false.");
    return text === "true";
  }
  if (typeof original === "number") {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error("Introduce un número válido.");
    return value;
  }
  if (original && typeof original === "object") return JSON.parse(text);
  return text;
}

export function DeveloperRecordsTable({ kind }: { kind: "leads" | "clients" }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = kind === "leads" ? await portalClient.developerLeads(page) : await portalClient.developerClients(page);
      setRows(result.rows); setTotal(result.total); setPageSize(result.pageSize);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar los registros"); }
    finally { setBusy(false); }
  }, [kind, page]);
  useEffect(() => { void load(); }, [load]);
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  async function save() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const value = parseValue(editing.text, editing.original);
      const result = kind === "leads"
        ? await portalClient.updateDeveloperLeadCell(editing.id, editing.column, value)
        : await portalClient.updateDeveloperClientCell(editing.id, editing.column, value);
      setRows((current) => current.map((row) => row.id === editing.id ? result.row : row));
      setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el campo"); }
    finally { setBusy(false); }
  }
  return <section className="panel developer-records">
    <header><div><h2>Tabla completa · {kind === "leads" ? "crm_leads" : "users"}</h2><p>{total} registros · {columns.length} columnas · pulsa una celda para editarla</p></div><button type="button" onClick={() => void load()} disabled={busy}>Actualizar</button></header>
    {error && <p role="alert" className="developer-records-error">{error}</p>}
    <div className="developer-records-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}>{columns.map((column) => <td key={column}>{column === "id" ? <span title={display(row[column])}>{display(row[column])}</span> : <button type="button" title={`${column}: ${display(row[column])}`} onClick={() => setEditing({ id: String(row.id), column, original: row[column], text: display(row[column]) })}>{display(row[column])}</button>}</td>)}</tr>)}</tbody></table></div>
    {!busy && rows.length === 0 && <p>No hay registros en esta página.</p>}
    <footer><button type="button" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button><span>Página {page} de {Math.max(1, Math.ceil(total / pageSize))}</span><button type="button" disabled={busy || page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Siguiente</button></footer>
    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="panel developer-cell-editor" role="dialog" aria-modal="true" aria-labelledby="developer-cell-title"><h2 id="developer-cell-title">Editar {editing.column}</h2><p>{kind === "leads" ? "Lead" : "Cliente"} {editing.id}</p><textarea aria-label={`Valor de ${editing.column}`} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} rows={6} autoFocus spellCheck={false} /><small>Escribe NULL para guardar un valor nulo. Para cambiar un valor vacío a número, booleano, objeto o lista, escribe JSON: seguido del valor.</small><div><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button></div></section></div>}
  </section>;
}

export function DeveloperLeadsTable() {
  return <DeveloperRecordsTable kind="leads" />;
}
