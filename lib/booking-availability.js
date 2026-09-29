function evaluateSlot(events, startAt, durationMin, availabilityTitle = 'LLAMADAS CLIENTES') {
  const requestedStart = new Date(startAt);
  const requestedEnd = new Date(requestedStart.getTime() + Number(durationMin) * 60000);
  const title = String(availabilityTitle).toLowerCase();

  const overlapsRequested = (calendarEvent) => {
    const eventStart = new Date(calendarEvent.start).getTime();
    const eventEnd = new Date(calendarEvent.end).getTime();
    return requestedStart.getTime() < eventEnd && requestedEnd.getTime() > eventStart;
  };
  const coversRequested = (calendarEvent) =>
    new Date(calendarEvent.start).getTime() <= requestedStart.getTime()
    && new Date(calendarEvent.end).getTime() >= requestedEnd.getTime();
  const isAvailabilityWindow = (calendarEvent) =>
    String(calendarEvent.summary || '').toLowerCase().includes(title);

  const insideWindow = (events || []).some((event) => isAvailabilityWindow(event) && coversRequested(event));
  const occupied = (events || []).some((event) =>
    !isAvailabilityWindow(event)
    && event.transparency !== 'transparent'
    && overlapsRequested(event)
  );
  return { available: insideWindow && !occupied, insideWindow, occupied };
}

module.exports = { evaluateSlot };
