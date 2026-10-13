Histórico de métricas del CRM

## Qué cambia y qué no

El histórico se guarda en tablas nuevas de la base de datos **Admin**. No se
inserta, actualiza ni elimina ningún registro de `crm_leads`, de la bandeja de
leads, de los clientes del Portal ni de sus eventos.

Las analíticas existentes combinan automáticamente dos tramos:

- Histórico validado de Notion: fechas anteriores al 23/09/2026, hora de Madrid.
- CRM nativo: desde el 23/09/2026, hora de Madrid.

El histórico solo conserva un HMAC seudónimo, fecha de adquisición, campaña,
canal, gestor y condición de cliente. No conserva nombre, email ni teléfono.
El email se utiliza una sola vez durante la importación para buscar una posible
firma contractual en el Portal. Si se encuentra una coincidencia única se
guardan el identificador interno del usuario y la fecha contractual; si no, el
registro cuenta como cliente de su cohorte, pero no se le inventa una fecha de
alta.

## Criterios incorporados

- `IN` y `25-26` cuentan como cliente.
- Sin campaña cuenta como `Orgánico`.
- Delft/Deflt y el resto de campañas con nombre cuentan como Meta, salvo los
  colegios indicados.
- Voramar, Kings College y The Ark cuentan como Colegios.
- Noel, María y Manuel aparecen por separado.
- Varios cuenta en el equipo, pero no se atribuye a una persona.
- Sin gestor cuenta en el total general, pero no en el rendimiento individual.
- Duplicados y registros de prueba ya depurados no se almacenan como incidencias
  ni se muestran en las métricas.
- Meta aporta el gasto. CRM + histórico aportan el número de leads y clientes.

## Tablas nuevas

- `crm_metric_import_batches`: control y auditoría de importaciones.
- `crm_historical_campaign_map`: cruce de nombres históricos con campañas Meta.
- `crm_historical_lead_facts`: una fila seudónima por lead histórico consolidado.
- `crm_active_historical_lead_facts`: vista de solo el lote activo.

La activación es atómica. Un lote nuevo se carga primero como `staged`; las
analíticas no lo ven hasta que se activa. Al activar, el lote anterior pasa a
`superseded` y puede reactivarse para hacer rollback.

## Aplicación paso a paso

### Importación directa utilizada en producción

Tras crear las tablas con la migración `202610080001`, el lote validado también
puede cargarse directamente desde
`202610080002_seed_crm_historical_metrics.sql`. Este archivo no contiene nombres,
emails ni teléfonos, valida los 1.168 leads y activa el lote en la misma
transacción. Los 109 clientes se atribuyen a su cohorte de adquisición, sin
inventar una fecha de firma cuando no existe una fecha contractual verificable.

El importador descrito más abajo se conserva para regeneraciones futuras que
necesiten volver a cruzar temporalmente el Portal y Meta.

### 1. Desplegar el código compatible

Publicar esta versión de la aplicación antes de activar datos. La aplicación es
compatible con una base que todavía no tenga las tablas históricas: seguirá
mostrando únicamente los datos actuales.

Antes del despliegue:

```bash
npm ci
npm test
npm run build
```

### 2. Crear las tablas en Supabase Admin

Abrir el editor SQL del proyecto Supabase que usa `ADMIN_SUPABASE_URL`, pegar y
ejecutar completo:

`supabase/admin-migrations/202610080001_create_crm_historical_metrics.sql`

No ejecutar esta migración en la base del Portal (`SUPABASE_URL`).

Comprobar:

```sql
select to_regclass('public.crm_historical_lead_facts') as facts,
       to_regclass('public.crm_metric_import_batches') as batches;
```

Ambas columnas deben devolver el nombre de su tabla.

### 3. Preparar las credenciales solo en el terminal local

El importador necesita acceso de servicio a las dos bases y a Meta. No añadir
estas claves al repositorio ni usar variables `VITE_`.

Variables necesarias:

```text
ADMIN_SUPABASE_URL
ADMIN_SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
META_ACCESS_TOKEN
META_AD_ACCOUNT_ID            # opcional si la cuenta activa se detecta sola
META_API_VERSION              # opcional; por defecto v26.0
CRM_HISTORY_HASH_SECRET       # opcional; si falta se genera uno efímero seguro
```

`CRM_HISTORY_HASH_SECRET` no es una variable que la web necesite en producción.
Si no se proporciona, el importador genera automáticamente un secreto aleatorio
seguro para el lote.

### 4. Ejecutar el ensayo sin escribir datos

Desde la raíz del repositorio:

```bash
npm run crm-history:preview -- \
  --input ../lead_analysis.json \
  --report /tmp/robin-crm-history-preview.json
```

El ensayo debe confirmar exactamente:

```text
Leads:       1168
Clientes:     109
Orgánicos:    303
Noel:         236
María:        258
Manuel:       229
Varios:         3
Sin gestor:   442
```

También muestra las campañas Meta que no se hayan podido cruzar por nombre. El
ensayo no contiene datos personales.

### 5. Resolver campañas Meta no coincidentes

La coincidencia automática exige un único nombre normalizado igual. Si queda
alguna campaña pendiente, crear fuera del repositorio un JSON como este:

```json
{
  "Delft Septiembre": {
    "id": "ID_REAL_DE_META",
    "name": "NOMBRE_REAL_EN_META"
  }
}
```

Repetir el ensayo añadiendo:

```bash
--campaign-map /ruta/privada/campaign-map.json
```

No usar `--allow-unmatched-meta` salvo que se acepte expresamente que esas
campañas queden sin gasto. Las campañas de colegios y Orgánico no necesitan
cruce con Meta.

### 6. Cargar un lote en estado de revisión

```bash
npm run crm-history:import -- \
  --input ../lead_analysis.json \
  --report /tmp/robin-crm-history-import.json \
  --campaign-map /ruta/privada/campaign-map.json
```

Este paso escribe únicamente en las tablas históricas nuevas. Al finalizar
devuelve un `batchId`, pero todavía no modifica las cifras visibles.

### 7. Validar el lote antes de activarlo

Sustituir `UUID_DEL_LOTE` en el editor SQL de Supabase Admin:

```sql
select id, status, expected_rows, imported_rows, cutoff_at, summary
from public.crm_metric_import_batches
where id = 'UUID_DEL_LOTE';

select
  count(*) as leads,
  count(*) filter (where is_client) as clientes,
  count(*) filter (where channel = 'organic') as organicos
from public.crm_historical_lead_facts
where import_batch_id = 'UUID_DEL_LOTE';

select manager, count(*) as leads,
       count(*) filter (where is_client) as clientes
from public.crm_historical_lead_facts
where import_batch_id = 'UUID_DEL_LOTE'
group by manager
order by manager;

select campaign_name, channel, count(*) as leads,
       count(*) filter (where is_client) as clientes
from public.crm_historical_lead_facts
where import_batch_id = 'UUID_DEL_LOTE'
group by campaign_name, channel
order by leads desc, campaign_name;
```

El estado debe ser `staged` y los tres totales principales, 1168, 109 y 303.

### 8. Activar el lote

Solo después de validar:

```bash
node scripts/import-historical-crm-metrics.mjs \
  --activate-batch UUID_DEL_LOTE
```

La activación empieza a alimentar las analíticas generales, de ventas, de
campañas y la clasificación por gestor. La bandeja, la cartera, el embudo actual
y los clientes vivos continúan leyendo exclusivamente los datos operativos.

### 9. Verificación visual

Comprobar en el portal:

1. Rango `Todo`: aparecen datos desde mayo de 2025.
2. Un rango anterior al 23/09/2026: muestra histórico sin duplicar CRM.
3. Un rango posterior al corte: coincide con el CRM nativo.
4. Campañas: conserva el nombre original y muestra gasto cuando existe cruce
   Meta.
5. Gestores: Noel, María y Manuel tienen sus cohortes; el total de equipo es
   mayor o igual que la suma individual por Varios y Sin gestor.
6. Bandeja de leads y cartera: no aparece ningún registro histórico nuevo.

## Rollback

La reversión no borra datos. Para volver al lote anterior:

```sql
select id, status, created_at, activated_at, expected_rows
from public.crm_metric_import_batches
where source = 'notion_historical_study'
order by created_at desc;
```

Después, reactivar el UUID anterior con el mismo comando del paso 8. La función
marca automáticamente el lote actual como `superseded` y vuelve a dejar activo
el anterior.

Para dejar temporalmente las analíticas sin histórico, sin borrar nada:

```sql
update public.crm_metric_import_batches
set status = 'superseded'
where source = 'notion_historical_study' and status = 'active';
```

## Efecto en el código

- La función de ventas carga la vista histórica si existe; si no existe, sigue
  funcionando con el CRM actual.
- Los rangos temporales y las campañas combinan ambos tramos en la misma
  respuesta que ya consume el portal.
- El gasto sigue viniendo de la API de Meta y se cruza por ID/nombre de campaña.
- Las métricas operativas —leads activos, cartera, embudo, tiempos y alertas— no
  consumen la tabla histórica.
- No se añade una pantalla de “análisis retrospectivo”.
