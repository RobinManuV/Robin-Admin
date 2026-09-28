# Mapeo de Notion a CRM

Fuente: [Main Database](https://app.notion.com/p/1eb069542601804c8f6fc22553255077)

La fuente contiene 424 leads. De ellos, 361 tienen email y 354 teléfono.

La primera migración completa a Supabase se realizó el 23/09/2026. Los UUID de
las páginas de Notion se conservan como claves primarias para permitir futuras
sincronizaciones idempotentes.

| Propiedad Notion | Destino PostgreSQL |
|---|---|
| Nombre | `crm_leads.name` |
| ID | `crm_leads.notion_numeric_id` |
| Email | `crm_leads.email` |
| Phone | `crm_leads.phone` |
| Email UID | `crm_leads.email_uid` |
| Summary | `crm_leads.summary` |
| Texto | `crm_leads.body_text` |
| comentario | `crm_leads.comment` |
| comentario primer contacto | `crm_leads.first_contact_comment` |
| area | `crm_leads.area` |
| TIPO | `crm_leads.lead_type` |
| IN? | `crm_leads.lifecycle` |
| Estado | `crm_leads.task_status` |
| heat | `crm_leads.heat` |
| Contact date | `crm_leads.contact_at` |
| Chase | `crm_leads.chase_at` |
| Meeting | `crm_leads.meeting_at` |
| Con retraso | `crm_leads.overdue_at` |
| Fecha Inside | `crm_leads.inside_at` |
| responsable | `crm_leads.owner_names` |
| Responsable | `crm_leads.notion_owner_ids` |
| Responsable (rollup) | `crm_leads.rolled_up_owner` |
| ROBIN | `crm_leads.robin` |
| eventos anteriores | `crm_leads.attended_previous_events` |
| 1er pago | `crm_leads.first_payment_received` |
| Carpeta Creada | `crm_leads.folder_created` |
| chck = si | `crm_leads.checked` |
| colegio | `crm_leads.school_name` |
| Colegios | `crm_leads.school_notion_urls` |
| Anuncio constante Enero | `crm_leads.campaign_notion_urls` |
| presentacion de canva | `crm_leads.canva_presentation_url` |
| Aplicacion 1/2/3 | `crm_lead_applications` (`position` 1–3) |
| formula | `crm_leads.source_formula` |
| Fecha de creación | `crm_leads.source_created_at` |
| Última edición | `crm_leads.source_updated_at` |

## Vistas que deberá reproducir el CRM

- **Main**: tabla principal, ordenada por ID descendente.
- **Leads calendar**: calendario basado en `meeting_at`.
- **Responsables**: tabla filtrada por ciclo `25-26`, ordenada por contacto.
- **Add lead**: formulario/tabla de alta de leads.

Los valores de las selecciones y estados están implementados como enums para
impedir que las automatizaciones creen categorías inválidas.
