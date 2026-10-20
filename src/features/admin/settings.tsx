import { useEffect, useState } from "react";
import { Camera, Database, KeyRound, Settings, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { portalClient } from "@/services/portal";
import type { PortalAccessUser } from "@/services/portal";
import { adminTabPermissions, allAdminTabPermissions } from "@/lib/admin-permissions";
import type { FeatureModuleProps } from './feature-shared';
import { Title } from './feature-shared';

export function Configuration({ onAddAdmin, onRemoveAdmin, currentUser, portalAdmin, notify, isProAdmin, isDeveloperAdmin }: FeatureModuleProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<PortalAccessUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [editingPermissions, setEditingPermissions] = useState<PortalAccessUser | null>(null);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState(portalAdmin.avatar_url || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [databaseTarget, setDatabaseTarget] = useState<"portal" | "admin" | "robinplan">("portal");
  const [sqlStatement, setSqlStatement] = useState("SELECT current_database(), current_user;");
  const [sqlResult, setSqlResult] = useState<unknown>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  async function refreshAdminUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const result = await portalClient.adminUsers();
      setUsers(result.users);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "No se pudieron cargar los administradores");
    } finally {
      setUsersLoading(false);
    }
  }
  useEffect(() => { void refreshAdminUsers(); }, []);
  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { const result = await portalClient.createAdmin({ name, email, username, password }); setUsers((items) => [...items, result.user]); onAddAdmin(name); setName(""); setEmail(""); setUsername(""); setPassword(""); setAdding(false); notify("Usuario administrador creado"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo crear el usuario"); }
    finally { setBusy(false); }
  }

  async function removeUser(user: PortalAccessUser) {
    if (!window.confirm(`¿Eliminar el acceso de ${user.nombre || user.email}?`)) return;
    try { await portalClient.deleteAdmin(user.id); setUsers((items) => items.filter((item) => item.id !== user.id)); onRemoveAdmin(user.nombre || user.email || ""); notify("Acceso eliminado"); }
    catch (error) { notify(error instanceof Error ? error.message : "No se pudo eliminar el usuario"); }
  }
  async function savePermissions() {
    if (!editingPermissions) return;
    setBusy(true);
    try {
      const result = await portalClient.setAdminPermissions(editingPermissions.id, selectedTabs);
      setUsers((items) => items.map((item) => item.id === editingPermissions.id ? { ...item, visible_tabs: result.visible_tabs } : item));
      setEditingPermissions(null);
      notify("Pestañas del perfil actualizadas");
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudieron guardar las pestañas"); }
    finally { setBusy(false); }
  }
  async function runDeveloperSql(event: React.FormEvent) {
    event.preventDefault();
    const statement = sqlStatement.trim();
    if (!statement) return;
    const targetName = { portal: "Portal", admin: "CRM / Admin", robinplan: "The Robin Plan" }[databaseTarget];
    if (!window.confirm(`Vas a ejecutar SQL en ${targetName}. Puede modificar o borrar datos y estructura de forma irreversible. ¿Continuar?`)) return;
    setSqlBusy(true);
    setSqlResult(null);
    try {
      const result = await portalClient.runDeveloperSql(databaseTarget, statement);
      setSqlResult(result.result);
      notify("Consulta ejecutada");
    } catch (error) {
      setSqlResult({ error: error instanceof Error ? error.message : "No se pudo ejecutar la consulta" });
    } finally { setSqlBusy(false); }
  }
  return (
    <div className="page">
      <Title name="Configuración" sub="Gestiona los usuarios con acceso al portal." eyebrow="INICIO · VISTA GLOBAL">{isProAdmin && <Button onClick={() => setAdding(true)}><UserPlus />Añadir usuario</Button>}</Title>
      {!isProAdmin && <div className="sync-status"><ShieldCheck /><span>Tu perfil puede consultar los administradores y gestionar su propia cuenta. Solo los perfiles Pro pueden añadir usuarios, eliminarlos o configurar sus pestañas.</span></div>}
      {adding && (
        <form className="panel add-user-form" onSubmit={createUser}>
          <div><h2>Nuevo usuario administrador</h2><p>Añade un usuario con acceso al panel.</p></div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" autoFocus required />
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
          <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} placeholder="Usuario para iniciar sesión" minLength={3} maxLength={50} pattern="[a-z0-9._-]{3,50}" autoComplete="username" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña inicial" minLength={10} autoComplete="new-password" required />
          <Button type="submit" disabled={busy}>{busy ? "Creando…" : "Añadir"}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
        </form>
      )}
      <section className="settings-security-grid">
        <form className="panel profile-photo-card" onSubmit={(event) => event.preventDefault()}><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" /> : currentUser.slice(0, 2).toUpperCase()}</div><div><h2>Foto de perfil</h2><p>JPG, PNG o WEBP de hasta 5 MB.</p><label className="ui-button outline"><Camera />Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await portalClient.uploadAvatar(file); setAvatarUrl(result.avatar_url); notify("Foto de perfil actualizada"); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo subir la foto"); } }} /></label></div></form>
        <form className="panel password-card" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await portalClient.changePassword(currentPassword, newPassword); setCurrentPassword(""); setNewPassword(""); notify("Contraseña actualizada"); } catch (error) { notify(error instanceof Error ? error.message : "No se pudo cambiar la contraseña"); } finally { setBusy(false); } }}><div><h2><KeyRound /> Cambiar mi contraseña</h2><p>Usa al menos 10 caracteres.</p></div><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Contraseña actual" required /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nueva contraseña" minLength={10} required /><Button type="submit" disabled={busy}>Actualizar</Button></form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Usuarios administradores</h2><p>{users.length} perfiles con acceso al panel</p></div><Button variant="outline" type="button" onClick={() => void refreshAdminUsers()} disabled={usersLoading}>{usersLoading ? "Actualizando…" : "Actualizar"}</Button></div>
        {usersLoading && users.length === 0 ? <p role="status">Cargando usuarios administradores…</p>
          : usersError ? <p role="alert">{usersError}</p>
            : users.length === 0 ? <p>No hay otros usuarios administradores para mostrar.</p>
              : <div className="admin-grid">
        {users.map((user) => { const label = user.nombre || user.email || user.username || "Administrador"; const current = user.id === portalAdmin.id; return <article className="panel" key={user.id}><i className={user.avatar_url ? "has-photo" : ""}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : label.slice(0, 2).toUpperCase()}</i><div><h3>{label}</h3><p>{user.email || "Administrador"} · {user.username || "sin usuario"}{user.display_id ? ` · ${user.display_id}` : ""}{current ? " · Usuario actual" : ""}</p></div><Badge variant="outline">{user.is_pro ? "Pro" : "Activo"}</Badge>{isProAdmin && !user.is_pro && <button type="button" className="ui-button outline" aria-label={`Configurar pestañas de ${label}`} title="Configurar pestañas" onClick={() => { setEditingPermissions(user); setSelectedTabs(user.visible_tabs || [...allAdminTabPermissions]); }}><Settings /></button>}{isProAdmin && !user.is_pro && !current ? <button type="button" className="remove-admin" aria-label={`Eliminar ${label}`} onClick={() => void removeUser(user)}><Trash2 /></button> : <span />}</article>; })}
              </div>}
      </section>
      {isDeveloperAdmin && <section className="panel developer-database-console">
        <div className="panel-heading"><div><h2><Database /> Consola de base de datos</h2><p>Acceso de desarrollador a los tres proyectos Supabase. Cada envío ejecuta una sola instrucción.</p></div><a className="ui-button outline" href={`${window.location.pathname.startsWith("/admin") ? "/admin" : ""}/base-datos`}>Abrir tablas de leads y clientes</a></div>
        <form onSubmit={(event) => void runDeveloperSql(event)}>
          <label>Proyecto<select value={databaseTarget} onChange={(event) => setDatabaseTarget(event.target.value as typeof databaseTarget)}><option value="portal">Portal del alumno</option><option value="admin">CRM / Admin</option><option value="robinplan">The Robin Plan</option></select></label>
          <label>SQL<textarea value={sqlStatement} onChange={(event) => setSqlStatement(event.target.value)} rows={8} spellCheck={false} placeholder="SELECT * FROM public.users LIMIT 20;" /></label>
          <p>La consulta se ejecuta con privilegios de servidor. No compartas esta cuenta. Los cambios de datos o esquema pueden ser irreversibles.</p>
          <Button type="submit" disabled={sqlBusy || !sqlStatement.trim()}>{sqlBusy ? "Ejecutando…" : "Ejecutar SQL"}</Button>
        </form>
        {sqlResult !== null && <pre className="developer-database-result" aria-live="polite">{JSON.stringify(sqlResult, null, 2)}</pre>}
      </section>}
      {editingPermissions && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingPermissions(null); }}><section className="panel" role="dialog" aria-modal="true" aria-labelledby="admin-permissions-title"><div className="panel-heading"><div><h2 id="admin-permissions-title">Pestañas visibles · {editingPermissions.nombre || editingPermissions.email}</h2><p>Elige qué áreas y secciones puede abrir este perfil.</p></div><button type="button" aria-label="Cerrar" onClick={() => setEditingPermissions(null)}><X /></button></div><div className="permission-checklist">{adminTabPermissions.map((item) => <label key={item.key}><input type="checkbox" checked={selectedTabs.includes(item.key)} onChange={(event) => setSelectedTabs((current) => event.target.checked ? [...current, item.key] : current.filter((key) => key !== item.key))} /><span><small>{item.group}</small>{item.label}</span></label>)}</div><div className="permission-actions"><Button variant="outline" type="button" onClick={() => setSelectedTabs([...allAdminTabPermissions])}>Marcar todas</Button><Button variant="outline" type="button" onClick={() => setSelectedTabs([])}>Quitar todas</Button><Button type="button" onClick={() => void savePermissions()} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button></div></section></div>}
    </div>
  );
}
