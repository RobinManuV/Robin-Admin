const DAY_MS = 86400000;

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value || '').trim();
const normalized = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const AGENTS = Object.freeze([
  { key: 'noel', name: 'Noel' },
  { key: 'manuel', name: 'Manuel' },
  { key: 'maria', name: 'María' },
]);
const STAGES = ['Por contactar', 'Contactado', 'Propuesta enviada', 'Llamada programada', 'Llamada tenida', 'En espera', 'Cliente'];
const LOST_REASON_LABELS = Object.freeze({
  price: 'Precio',
  more_destinations: 'Están buscando más destinos',
  competition: 'Competencia',
  other: 'Otros',
});

function agentKey(value) {
  const text = normalized(value);
  if (text.includes('noel')) return 'noel';
  if (text.includes('manuel')) return 'manuel';
  if (text.includes('maria')) return 'maria';
  return null;
}

function percentage(numerator, denominator) {
  return denominator ? round(numerator / denominator * 100) : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? round(sorted[middle]) : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function isInBounds(value, bounds) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= bounds.start && date < bounds.end;
}

function leadCreatedAt(lead) {
  return lead.source_created_at || lead.created_at || null;
}

function isNativeLead(lead) {
  return normalized(lead.source_payload?.source) !== 'notion';
}

function eventAgentKey(event, crmUserById) {
  return agentKey(crmUserById.get(String(event.user_id || ''))?.name || event.metadata?.owner_name || event.to_value);
}

function buildCrmPerformance({ bounds, leads, events = [], sessions = [], crmUsers = [], applications = [], signedRows = [], payments = [], availability = {} }) {
  const now = new Date();
  const crmUserById = new Map(crmUsers.map((user) => [String(user.id), user]));
  const leadById = new Map(leads.map((lead) => [String(lead.id), lead]));
  const nativeLeads = leads.filter(isNativeLead);
  const periodLeads = nativeLeads.filter((lead) => !lead.is_test && isInBounds(leadCreatedAt(lead), bounds));
  const periodEvents = events.filter((event) => isInBounds(event.created_at, bounds));
  const eventTimes = events.map((event) => new Date(event.created_at).getTime()).filter(Number.isFinite);
  const sessionTimes = sessions.map((session) => new Date(session.started_at).getTime()).filter(Number.isFinite);
  const eventHistoryStart = eventTimes.length ? new Date(Math.min(...eventTimes)) : null;
  const sessionHistoryStart = sessionTimes.length ? new Date(Math.min(...sessionTimes)) : null;
  const eventsComplete = Boolean(availability.events && eventHistoryStart && eventHistoryStart <= bounds.start);
  const sessionsComplete = Boolean(availability.sessions && sessionHistoryStart && sessionHistoryStart <= bounds.start);

  const duration = bounds.end.getTime() - bounds.start.getTime();
  const previousBounds = { start: new Date(bounds.start.getTime() - duration), end: bounds.start };
  const previousLeads = nativeLeads.filter((lead) => !lead.is_test && isInBounds(leadCreatedAt(lead), previousBounds)).length;
  const leadVariation = previousLeads ? round((periodLeads.length - previousLeads) / previousLeads * 100) : null;

  const paidByUser = new Map();
  const firstPaidByUser = new Map();
  payments.filter((payment) => payment.status === 'paid').forEach((payment) => {
    paidByUser.set(String(payment.user_id), round((paidByUser.get(String(payment.user_id)) || 0) + Number(payment.amount || 0)));
    const paidAt = payment.paid_at || payment.created_at;
    if (paidAt && (!firstPaidByUser.has(String(payment.user_id)) || paidAt < firstPaidByUser.get(String(payment.user_id)))) firstPaidByUser.set(String(payment.user_id), paidAt);
  });
  signedRows.forEach((row) => {
    row.agentKey = agentKey(row.lead?.source_payload?.sales_agent || row.lead?.owner_names?.[0]);
    row.paid = paidByUser.get(String(row.user.id)) || row.paid || 0;
  });

  const contracted = round(signedRows.reduce((total, row) => total + Number(row.contracted || 0), 0));
  const collected = round(signedRows.reduce((total, row) => total + Number(row.paid || 0), 0));
  const wonEvents = periodEvents.filter((event) => event.event_type === 'won');
  const lostEvents = periodEvents.filter((event) => event.event_type === 'lost');

  const eventsByLead = new Map();
  events.forEach((event) => {
    const rows = eventsByLead.get(String(event.lead_id)) || [];
    rows.push(event);
    eventsByLead.set(String(event.lead_id), rows);
  });
  eventsByLead.forEach((rows) => rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));

  const assignmentEvents = periodEvents.filter((event) => ['assigned', 'owner_changed'].includes(event.event_type));
  const speedValues = assignmentEvents.map((assigned) => {
    const contacted = (eventsByLead.get(String(assigned.lead_id)) || []).find((event) => (
      event.event_type === 'stage_changed'
      && normalized(event.to_value) === 'contactado'
      && new Date(event.created_at) >= new Date(assigned.created_at)
    ));
    return contacted ? (new Date(contacted.created_at).getTime() - new Date(assigned.created_at).getTime()) / 60000 : NaN;
  });

  const lastEventByLead = new Map();
  events.forEach((event) => {
    const current = lastEventByLead.get(String(event.lead_id));
    if (!current || new Date(event.created_at) > new Date(current.created_at)) lastEventByLead.set(String(event.lead_id), event);
  });

  const agents = AGENTS.map((agent) => {
    const agentAssignments = assignmentEvents.filter((event) => eventAgentKey(event, crmUserById) === agent.key);
    const assignedLeadIds = new Set(agentAssignments.map((event) => String(event.lead_id)));
    const contactedLeadIds = new Set(periodEvents.filter((event) => (
      assignedLeadIds.has(String(event.lead_id)) && event.event_type === 'stage_changed' && normalized(event.to_value) === 'contactado'
    )).map((event) => String(event.lead_id)));
    const agentWon = wonEvents.filter((event) => eventAgentKey(event, crmUserById) === agent.key).length;
    const agentLost = lostEvents.filter((event) => eventAgentKey(event, crmUserById) === agent.key).length;
    const agentSigned = signedRows.filter((row) => row.agentKey === agent.key);
    const agentContracted = round(agentSigned.reduce((total, row) => total + Number(row.contracted || 0), 0));
    const agentPaid = round(agentSigned.reduce((total, row) => total + Number(row.paid || 0), 0));
    const portfolio = nativeLeads.filter((lead) => agentKey(lead.owner_names?.[0]) === agent.key && !['cliente', 'lost'].includes(normalized(lead.crm_stage))).length;
    const stale = nativeLeads.filter((lead) => {
      if (agentKey(lead.owner_names?.[0]) !== agent.key || ['cliente', 'lost'].includes(normalized(lead.crm_stage))) return false;
      const last = lastEventByLead.get(String(lead.id));
      return last && now.getTime() - new Date(last.created_at).getTime() > 7 * DAY_MS;
    }).length;
    const agentUserIds = new Set(crmUsers.filter((user) => agentKey(user.name) === agent.key).map((user) => String(user.id)));
    const sessionDays = new Set(sessions.filter((session) => agentUserIds.has(String(session.user_id)) && isInBounds(session.started_at, bounds)).map((session) => new Date(session.started_at).toISOString().slice(0, 10)));
    const activeDays = sessionsComplete ? sessionDays.size : null;
    const actionCount = periodEvents.filter((event) => eventAgentKey(event, crmUserById) === agent.key && event.event_type !== 'created').length;
    const agentSpeeds = agentAssignments.map((assigned) => {
      const contacted = (eventsByLead.get(String(assigned.lead_id)) || []).find((event) => event.event_type === 'stage_changed' && normalized(event.to_value) === 'contactado' && new Date(event.created_at) >= new Date(assigned.created_at));
      return contacted ? (new Date(contacted.created_at).getTime() - new Date(assigned.created_at).getTime()) / 60000 : NaN;
    });
    const collectionDays = agentSigned.map((row) => {
      const paidAt = firstPaidByUser.get(String(row.user.id));
      return paidAt ? (new Date(paidAt).getTime() - new Date(row.user.contract_signed_at).getTime()) / DAY_MS : NaN;
    });
    const leadIds = new Set(agentSigned.map((row) => String(row.lead?.id || '')).filter(Boolean));
    const resolvedApps = applications.filter((application) => leadIds.has(String(application.lead_id)) && ['got_it', 'rejected', 'no'].includes(application.status));
    const admitted = resolvedApps.filter((application) => application.status === 'got_it').length;
    return {
      ...agent,
      assigned: eventsComplete ? agentAssignments.length : null,
      contacted: eventsComplete ? contactedLeadIds.size : null,
      contactRate: eventsComplete ? percentage(contactedLeadIds.size, agentAssignments.length) : null,
      speedMinutes: eventsComplete ? median(agentSpeeds) : null,
      contracts: agentSigned.length,
      won: eventsComplete ? agentWon : null,
      lost: eventsComplete ? agentLost : null,
      winRate: eventsComplete ? percentage(agentWon, agentWon + agentLost) : null,
      contracted: agentContracted,
      revenuePerLead: eventsComplete && agentAssignments.length ? round(agentContracted / agentAssignments.length) : null,
      portfolio,
      stale: availability.events ? stale : null,
      activeDays,
      actionsPerDay: eventsComplete && activeDays ? round(actionCount / activeDays) : null,
      collected: agentPaid,
      collectionRate: percentage(agentPaid, agentContracted),
      collectionDays: median(collectionDays),
      admissionRate: availability.applications ? percentage(admitted, resolvedApps.length) : null,
      applications: availability.applications ? resolvedApps.length : null,
    };
  });

  const stageTimes = STAGES.slice(1, -1).map((stage) => ({
    stage,
    values: Object.fromEntries(AGENTS.map((agent) => {
      if (!eventsComplete) return [agent.key, null];
      const intervals = [];
      eventsByLead.forEach((rows) => {
        rows.forEach((event, index) => {
          if (event.event_type !== 'stage_changed' || event.to_value !== stage || eventAgentKey(event, crmUserById) !== agent.key) return;
          const next = rows.slice(index + 1).find((candidate) => candidate.event_type === 'stage_changed' || candidate.event_type === 'won' || candidate.event_type === 'lost');
          if (next) intervals.push((new Date(next.created_at).getTime() - new Date(event.created_at).getTime()) / DAY_MS);
        });
      });
      return [agent.key, median(intervals)];
    })),
  }));

  let funnel = null;
  if (eventsComplete) {
    const assignedIds = new Set(assignmentEvents.map((event) => String(event.lead_id)));
    funnel = STAGES.map((stage, index) => {
      const count = [...assignedIds].filter((leadId) => {
        if (index === 0) return true;
        const rows = eventsByLead.get(leadId) || [];
        return rows.some((event) => event.event_type === 'won' ? stage === 'Cliente' : event.event_type === 'stage_changed' && STAGES.indexOf(event.to_value) >= index);
      }).length;
      const previous = index ? STAGES[index - 1] : null;
      const previousCount = index ? [...assignedIds].filter((leadId) => {
        const rows = eventsByLead.get(leadId) || [];
        return index - 1 === 0 || rows.some((event) => event.event_type === 'won' ? previous === 'Cliente' : event.event_type === 'stage_changed' && STAGES.indexOf(event.to_value) >= index - 1);
      }).length : count;
      const lost = lostEvents.filter((event) => event.from_value === stage).length;
      return { stage, count, conversion: index ? percentage(count, previousCount) : 100, lost };
    });
  }

  const periodLostLeads = nativeLeads.filter((lead) => normalized(lead.crm_stage) === 'lost' && isInBounds(lead.lost_at, bounds));
  const lostReasons = Object.entries(LOST_REASON_LABELS).map(([key, label]) => {
    const count = periodLostLeads.filter((lead) => lead.source_payload?.lost_reason === key).length;
    return { key, label, count, percentage: percentage(count, periodLostLeads.length) };
  });

  const unassigned = nativeLeads.filter((lead) => !lead.owner_names?.length && !['cliente', 'lost'].includes(normalized(lead.crm_stage)) && now - new Date(leadCreatedAt(lead)) > 2 * 3600000).length;
  const overdueMeetings = nativeLeads.filter((lead) => normalized(lead.crm_stage) === 'llamada programada' && lead.meeting_at && now - new Date(lead.meeting_at) > DAY_MS).length;
  const staleTotal = availability.events ? agents.reduce((total, agent) => total + Number(agent.stale || 0), 0) : null;
  const waitingContact = nativeLeads.filter((lead) => normalized(lead.crm_stage) === 'por contactar' && lead.stage_entered_at && now - new Date(lead.stage_entered_at) > DAY_MS).length;
  const alerts = [
    { key: 'unassigned', severity: 'bad', count: unassigned, label: 'leads en bandeja más de 2 h sin asignar' },
    { key: 'stale', severity: 'bad', count: staleTotal, label: 'leads estancados más de 7 días' },
    { key: 'meetings', severity: 'warn', count: overdueMeetings, label: 'llamadas programadas vencidas' },
    { key: 'contact', severity: 'warn', count: availability.events ? waitingContact : null, label: 'leads en Por contactar más de 24 h' },
  ];

  let fifo = AGENTS.map((agent) => ({ ...agent, value: null }));
  if (eventsComplete) {
    const firstAssignmentByLead = new Map();
    events.filter((event) => event.event_type === 'assigned').forEach((event) => {
      const key = String(event.lead_id);
      if (!firstAssignmentByLead.has(key) || new Date(event.created_at) < new Date(firstAssignmentByLead.get(key).created_at)) firstAssignmentByLead.set(key, event);
    });
    fifo = AGENTS.map((agent) => {
      const rows = assignmentEvents.filter((event) => eventAgentKey(event, crmUserById) === agent.key);
      const violations = rows.filter((event) => {
        const assignedLead = leadById.get(String(event.lead_id));
        const assignedCreated = new Date(leadCreatedAt(assignedLead)).getTime();
        const eventTime = new Date(event.created_at).getTime();
        return nativeLeads.some((candidate) => {
          if (String(candidate.id) === String(event.lead_id)) return false;
          const candidateCreated = new Date(leadCreatedAt(candidate)).getTime();
          const candidateAssignment = firstAssignmentByLead.get(String(candidate.id));
          return candidateCreated < assignedCreated && candidateCreated <= eventTime && (!candidateAssignment || new Date(candidateAssignment.created_at).getTime() > eventTime);
        });
      }).length;
      return { ...agent, value: rows.length ? round((1 - violations / rows.length) * 100) : null };
    });
  }

  const pipeline = nativeLeads.filter((lead) => !['cliente', 'lost'].includes(normalized(lead.crm_stage)));
  const normalizedEmailCounts = new Map();
  nativeLeads.forEach((lead) => {
    const email = normalized(lead.email);
    if (email) normalizedEmailCounts.set(email, (normalizedEmailCounts.get(email) || 0) + 1);
  });
  const quality = [
    { key: 'category', label: 'Leads en pipeline sin categoría', count: pipeline.filter((lead) => !lead.lead_type).length },
    { key: 'heat', label: 'Leads sin heat', count: pipeline.filter((lead) => lead.heat == null).length },
    { key: 'campaign', label: 'Leads sin campaña', count: nativeLeads.filter((lead) => !lead.source_payload?.campaign_id && !lead.source_payload?.campaign_name && !lead.source_payload?.ad_id).length },
    { key: 'test', label: 'Leads de prueba', count: nativeLeads.filter((lead) => lead.is_test || /(^|\s)test(\s|$)/i.test(lead.name || '') || /^test@/i.test(lead.email || '')).length },
    { key: 'duplicates', label: 'Posibles duplicados', count: [...normalizedEmailCounts.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0) },
  ];

  return {
    history: {
      eventsAvailable: Boolean(availability.events),
      sessionsAvailable: Boolean(availability.sessions),
      applicationsAvailable: Boolean(availability.applications),
      eventsComplete,
      sessionsComplete,
      eventsSince: eventHistoryStart?.toISOString() || null,
      sessionsSince: sessionHistoryStart?.toISOString() || null,
    },
    summary: {
      newLeads: periodLeads.length,
      leadVariation,
      contracts: signedRows.length,
      contracted,
      averageTicket: signedRows.length ? round(contracted / signedRows.length) : null,
      won: eventsComplete ? wonEvents.length : null,
      lost: eventsComplete ? lostEvents.length : null,
      winRate: eventsComplete ? percentage(wonEvents.length, wonEvents.length + lostEvents.length) : null,
      speedMinutes: eventsComplete ? median(speedValues) : null,
      collected,
      collectionRate: percentage(collected, contracted),
      qualityIssues: quality.reduce((total, item) => total + item.count, 0),
    },
    agents,
    stageTimes,
    funnel,
    lostReasons,
    alerts,
    fifo,
    quality,
  };
}

module.exports = { AGENTS, STAGES, buildCrmPerformance };
