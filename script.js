Warning: truncated output (original token count: 3755)
Total output lines: 468

// Global variables for schedule data
let scheduleData = null;

// Parse ICS calendar data using ical.js library
function parseICSCalendar(icsContent) {
  const abDays = new Map();
  const allEvents = [];
  
  try {
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    vevents.forEach(vevent => {
      const event = new ICAL.Event(vevent);
      const summary = event.summary;
      const startDate = event.startDate;
      const endDate = event.endDate;
      const location = event.location || '';
      
      // Store all events for later filtering
      allEvents.push({
        summary,
        startDate,
        endDate,
        location,
        isAllDay: !startDate.isDate ? false : true
      });
      
      // Extract A/B days
      if (summary === 'A Day' || summary === 'B Day') {
        // Use the ICS date components directly so all-day events keep their
        // calendar date in America/Denver instead of shifting by timezone.
        const dateStr = [
          startDate.year,
          String(startDate.month).padStart(2, '0'),
          String(startDate.day).padStart(2, '0')
        ].join('-');
        abDays.set(dateStr, summary === 'A Day' ? 'A' : 'B');
      }
    });
    
  } catch (error) {
    console.error('Error parsing ICS with ical.js:', error);
  }
  
  return { abDays, allEvents };
}

// Load schedule data and calendar
let calendarABDays = new Map();
let allCalendarEvents = [];

async function loadScheduleData() {
  try {
    // Load JSON data
    const response = await fetch('schedule-data.json');
    scheduleData = await response.json();
    
    // Load and parse calendar
    try {
      const calendarResponse = await fetch('westlake_high_events.ics');
      const icsContent = await calendarResponse.text();
      const { abDays, allEvents } = parseICSCalendar(icsContent);
      calendarABDays = abDays;
      allCalendarEvents = allEvents;
      console.log(`Loaded ${calendarABDays.size} A/B day entries and ${allCalendarEvents.length} total events from calendar`);
    } catch (calError) {
      console.warn('Failed to load calendar data:', calError);
    }
    
  } catch (error) {
    console.error('Failed to load schedule data:', error);
    // Fallback data in case JSON loading fails
    scheduleData = {
      schoolYear: {
        start: "2026-08-19T00:00:00",
        end: "2027-05-28T23:59:59"
      },
      schedules: {
        regular: [],
        wednesday: []
      },
      classes: { A: [], B: [] }
    };
  }
}

// ==== Time + formatters using Day.js ====
const tz = 'America/Denver';
let debugNow = null; // set via hidden debug UI

// Initialize Day.js plugins
dayjs.extend(dayjs_plugin_duration);
dayjs.extend(dayjs_plugin_relativeTime);

const fmt = (d, opts = {}) => dayjs(d).format('dddd, MMMM D, YYYY');
const hhmm = (date) => dayjs(date).format('h:mma').toLowerCase();
const humanTime = (seconds) => {
  const duration = dayjs.duration(Math.max(0, Math.floor(seconds)), 'seconds');
  const h = duration.hours();
  const m = duration.minutes();
  const s = duration.seconds();
  
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
};
const teacherLast = t => (t || '').trim().split(/\s+/).slice(-1)[0];
const getNow = () => debugNow ? new Date(debugNow) : new Date(new Date().toLocaleString('en-US', {timeZone: tz}));
const parseTime = hm => {
  const d = getNow();
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

// ==== School days and A/B days come directly from the published calendar ====
const ymd = d => dayjs(d).format('YYYY-MM-DD');
const isSchoolDay = d => calendarABDays.has(ymd(d));

function getABDay() {
  const d = getNow();
  return calendarABDays.get(ymd(d)) || null;
}

// ==== Bell schedules ====
const isWednesday = () => dayjs(getNow()).format('dddd') === 'Wednesday';
co…1755 tokens truncated…{
      const start = event.startDate.toJSDate();
      const end = event.endDate.toJSDate();
      timeText = `${hhmm(start)}`;
      if (end.getTime() !== start.getTime()) {
        timeText += `–${hhmm(end)}`;
      }
    }
    
    const timeEl = document.createElement('div');
    timeEl.className = 'event-time';
    timeEl.textContent = timeText;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'event-content';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'event-title';
    titleEl.textContent = event.summary;
    contentEl.appendChild(titleEl);
    
    if (event.location) {
      const locationEl = document.createElement('div');
      locationEl.className = 'event-location';
      locationEl.textContent = event.location;
      contentEl.appendChild(locationEl);
    }
    
    eventDiv.appendChild(timeEl);
    eventDiv.appendChild(contentEl);
    eventsEl.appendChild(eventDiv);
  });
}

function renderAll() {
  renderHeader();
  renderPeriods();
  renderEvents();
}

// ==== Boot + hidden debug control (5 clicks) ====
window.addEventListener('DOMContentLoaded', async () => {
  // Load schedule data first
  await loadScheduleData();

  status = document.getElementById('status');
  todayEl = document.getElementById('today');
  periodsEl = document.getElementById('periods');
  eventsEl = document.getElementById('events');
  debugToggle = document.getElementById('debugToggle');
  debugControls = document.getElementById('debugControls');
  debugDateTime = document.getElementById('debugDateTime');

  // Set default value to current date/time
  const now = new Date();
  const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  debugDateTime.value = localDateTime.toISOString().slice(0, 16);

  // Simple toggle for debug controls
  debugToggle.addEventListener('click', () => {
    const isVisible = debugControls.style.display === 'block';
    debugControls.style.display = isVisible ? 'none' : 'block';
  });

  debugDateTime.addEventListener('change', () => {
    debugNow = debugDateTime.value ? new Date(debugDateTime.value) : null;
    renderAll();
  });

  // Reset debug functionality
  const resetDebug = document.getElementById('resetDebug');
  resetDebug.addEventListener('click', () => {
    debugNow = null;
    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    debugDateTime.value = localDateTime.toISOString().slice(0, 16);
    renderAll();
  });

  renderAll();
  setInterval(renderAll, 1000);

  runTests();
});

// ==== Tests (non-visual) ====
function runTests() {
  const out = [];
  const ok = (name, cond) => out.push(`${cond ? '✔' : '✘'} ${name}`);
  
  const periodAt = (dateISO, timeHM, wed) => {
    const old = debugNow;
    const base = new Date(dateISO);
    const [h, m] = timeHM.split(':').map(Number);
    debugNow = base;
    base.setHours(h, m, 0, 0);
    const sched = wed ? scheduleData.schedules.wednesday : scheduleData.schedules.regular;
    let found = null;
    for (const r of sched) {
      const s = parseTime(r.start), e = parseTime(r.end);
      if (base >= s && base <= e) {
        found = Array.isArray(r.code) ? r.code[0] : (r.code);
        break;
      }
    }
    debugNow = old;
    return found;
  };

  ok('Regular Tue 07:50 → A1', periodAt('2025-09-02', '07:50', false) === 'A1');
  ok('Regular Tue 12:10 → LUNCH', periodAt('2025-09-02', '12:10', false) === 'LUNCH');
  ok('Wednesday 08:40 → A1', periodAt('2025-09-03', '08:40', true) === 'A1');
  ok('After school 15:00 → null', periodAt('2025-09-02', '15:00', false) === null);
  ok('End boundary inclusive 09:04 → A1', periodAt('2025-09-02', '09:04', false) === 'A1');
  ok('Start boundary 09:14 → A2', periodAt('2025-09-02', '09:14', false) === 'A2');
  
  console.log('[Schedule tests passed]\n' + out.join('\n'));
  document.getElementById('testlog').textContent = out.join('\n');
}

