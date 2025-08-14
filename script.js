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
        const dateStr = startDate.toJSDate().toISOString().slice(0, 10);
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
        start: "2025-08-13T00:00:00",
        end: "2026-05-22T23:59:59"
      },
      offDays: [],
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

// ==== Auto A/B from first day forward, skipping weekends & non-school days ====
const ymd = d => dayjs(d).format('YYYY-MM-DD');
const isWeekend = d => { const x = d.getDay(); return x === 0 || x === 6; };
const isSchoolDay = d => {
  if (!scheduleData) return false;
  const schoolStart = new Date(scheduleData.schoolYear.start);
  const schoolEnd = new Date(scheduleData.schoolYear.end);
  const offDays = new Set(scheduleData.offDays);
  return d >= schoolStart && d <= schoolEnd && !isWeekend(d) && !offDays.has(ymd(d));
};

function getABDay() {
  const d = getNow();
  if (!isSchoolDay(d)) return null;
  if (!scheduleData) return null;
  
  // Use calendar data if available
  const dateStr = ymd(d);
  if (calendarABDays.has(dateStr)) {
    return calendarABDays.get(dateStr);
  }
  
  // Fallback to calculation if calendar data not available
  let count = 0;
  const cur = new Date(scheduleData.schoolYear.start);
  while (cur <= d) {
    if (isSchoolDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return (count % 2 === 1) ? 'A' : 'B'; // Aug 13, 2025 = A
}

// ==== Bell schedules ====
const isWednesday = () => dayjs(getNow()).format('dddd') === 'Wednesday';
const todaySchedule = () => {
  if (!scheduleData) return [];
  return isWednesday() ? scheduleData.schedules.wednesday : scheduleData.schedules.regular;
};

// ==== Classes ====
const classesForDay = () => {
  const ab = getABDay();
  if (!ab || !scheduleData) return [];
  return scheduleData.classes[ab] || [];
};
const findClassByPeriod = p => classesForDay().find(c => c.period === p);
const labelFromCode = arr => {
  if (arr[0] === 'LUNCH') return arr[0];
  const ab = getABDay() || 'A';
  return ab === 'A' ? arr[0] : arr[1];
};

// ==== Current/next helpers (INCLUSIVE end) ====
function getCurrent() {
  const now = getNow();
  const schedule = todaySchedule();
  return schedule.find(row => {
    const start = parseTime(row.start), end = parseTime(row.end);
    return now >= start && now <= end;
  });
}

function getNext() {
  const now = getNow();
  return todaySchedule().find(row => parseTime(row.start) > now);
}

// ==== Renderers ====
let status, todayEl, periodsEl, eventsEl, debugToggle, debugControls, debugDateTime;
let lastRenderedDate = null;

function renderHeader() {
  const n = getNow();
  const currentDate = ymd(n);
  
  // Only update date/status if the date has changed
  if (lastRenderedDate !== currentDate) {
    const ab = getABDay();
    todayEl.textContent = fmt(n, {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'});
    status.textContent = (ab ? ab + ' Day' : 'No School') + ' · ' + (isWednesday() ? 'Wed' : 'Regular');
    lastRenderedDate = currentDate;
  }
}

let lastPeriodStructure = null;

function buildPeriodStructure() {
  const sched = todaySchedule();
  const ab = getABDay();
  
  if (!ab) {
    return { type: 'no-school' };
  }
  
  return {
    type: 'periods',
    schedule: sched.map(row => {
      const start = parseTime(row.start), end = parseTime(row.end);
      const label = Array.isArray(row.code) ? labelFromCode(row.code) : row.code;
      const info = /^A|^B/.test(label) ? findClassByPeriod(label) : null;
      return { row, start, end, label, info };
    })
  };
}

function renderPeriods() {
  const now = getNow();
  const current = getCurrent();
  const next = getNext();
  const currentStructure = buildPeriodStructure();
  
  // Only rebuild if structure changed (different day, schedule, etc.)
  if (!lastPeriodStructure || JSON.stringify(lastPeriodStructure) !== JSON.stringify(currentStructure)) {
    periodsEl.innerHTML = '';
    
    if (currentStructure.type === 'no-school') {
      const msg = document.createElement('div');
      msg.className = 'muted';
      msg.textContent = 'No school today.';
      periodsEl.appendChild(msg);
      lastPeriodStructure = currentStructure;
      return;
    }
    
    currentStructure.schedule.forEach((item, index) => {
      const { row, start, end, label, info } = item;
      
      // Create period container
      const div = document.createElement('div');
      div.className = 'period';
      div.dataset.index = index;
      
      const timeHtml = `<div class="pill-sm mono">${hhmm(start)}–${hhmm(end)}</div>`;
      const mainHtml = `<div><div><b>${label}</b> ${info ? '· ' + info.name : ''}</div>${info ? `<div class='muted small'>Room ${info.room} • ${teacherLast(info.teacher)}</div>` : ''}<div class="time-remaining-container"></div></div>`;
      div.innerHTML = timeHtml + mainHtml;
      
      periodsEl.appendChild(div);
    });
    
    lastPeriodStructure = currentStructure;
  }
  
  // Update dynamic content only
  updateDynamicContent(now, current, next, currentStructure);
}

function updateDynamicContent(now, current, next, structure) {
  // Remove existing next banner
  const existingBanner = periodsEl.querySelector('.next-banner');
  if (existingBanner) existingBanner.remove();
  
  if (structure.type === 'no-school') return;
  
  structure.schedule.forEach((item, index) => {
    const { start, end, label } = item;
    const periodEl = periodsEl.querySelector(`[data-index="${index}"]`);
    if (!periodEl) return;
    
    const timeRemainingContainer = periodEl.querySelector('.time-remaining-container');
    let isActive = false;
    
    // Determine period status
    let periodClass = 'period';
    timeRemainingContainer.innerHTML = '';
    
    if (now > end) {
      // Period has already finished
      periodClass += ' passed';
    } else if (current) {
      isActive = label === (Array.isArray(current.code) ? labelFromCode(current.code) : current.code);
      if (isActive) {
        const total = (end - start) / 1000;
        const passed = (now - start) / 1000;
        const remain = humanTime(total - passed);
        timeRemainingContainer.innerHTML = `<div class="time-remaining">${remain} left</div>`;
        periodClass += ' active';
      }
    } else if (next) {
      isActive = label === (Array.isArray(next.code) ? labelFromCode(next.code) : next.code);
      if (isActive) {
        const untilStart = Math.max(0, (start - now) / 1000);
        const bannerEl = document.createElement('div');
        bannerEl.className = 'next-banner mono';
        bannerEl.textContent = `Next class starts in ${humanTime(untilStart)}`;
        periodsEl.insertBefore(bannerEl, periodEl);
        // Don't mark as active when showing "Next class starts in..." banner
      }
    }
    
    periodEl.className = periodClass;
  });
}

function getTodaysEvents() {
  const today = dayjs(getNow()).startOf('day');
  const tomorrow = today.add(1, 'day');
  
  return allCalendarEvents.filter(event => {
    const eventStart = dayjs(event.startDate.toJSDate());
    const eventEnd = dayjs(event.endDate.toJSDate());
    
    // Include events that start today or span across today
    return (eventStart.isSame(today, 'day')) || 
           (eventStart.isBefore(today) && eventEnd.isAfter(today));
  }).sort((a, b) => {
    // Sort by start time
    return dayjs(a.startDate.toJSDate()).unix() - dayjs(b.startDate.toJSDate()).unix();
  });
}

function renderEvents() {
  const todaysEvents = getTodaysEvents();
  eventsEl.innerHTML = '';
  
  if (todaysEvents.length === 0) {
    const noEvents = document.createElement('div');
    noEvents.className = 'no-events';
    noEvents.textContent = 'No events scheduled for today.';
    eventsEl.appendChild(noEvents);
    return;
  }
  
  const now = getNow();
  
  todaysEvents.forEach(event => {
    // Skip A/B day events since we show those in the header
    if (event.summary === 'A Day' || event.summary === 'B Day') {
      return;
    }
    
    const eventDiv = document.createElement('div');
    let eventClass = 'event';
    
    // Determine event status
    if (!event.isAllDay) {
      const start = event.startDate.toJSDate();
      const end = event.endDate.toJSDate();
      
      if (now >= start && now <= end) {
        eventClass += ' active';
      } else if (now > end) {
        eventClass += ' passed';
      }
    }
    
    eventDiv.className = eventClass;
    
    let timeText = '';
    if (event.isAllDay) {
      timeText = 'All Day';
    } else {
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
