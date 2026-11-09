const $ = (id) => document.getElementById(id);
const state = { from: null, to: null, trains: [], toastTimer: null };

const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('journeyDate').value = localDate;
$('journeyDate').min = localDate;
$('year').textContent = new Date().getFullYear();

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function setupStationAutocomplete(which) {
  const input = $(which + 'Input');
  const codeInput = $(which + 'Code');
  const box = $(which + 'Suggestions');
  let timer;
  let activeItems = [];

  function close() {
    box.classList.remove('open');
    input.setAttribute('aria-expanded', 'false');
  }

  function selectStation(station) {
    input.value = `${station.name} (${station.code})`;
    codeInput.value = station.code;
    state[which] = station;
    close();
  }

  function render(items, message) {
    activeItems = items;
    if (!items.length) {
      box.innerHTML = `<div class="suggestion-message">${escapeHtml(message || 'No matching stations found.')}</div>`;
    } else {
      box.innerHTML = items.map((station, index) => `
        <button type="button" class="suggestion-item" role="option" data-index="${index}">
          <span class="suggestion-pin">⌖</span>
          <span class="suggestion-main"><span class="suggestion-name">${escapeHtml(station.name)}</span><span class="suggestion-meta">${escapeHtml(station.state || 'Indian Railways station')}</span></span>
          <span class="suggestion-code">${escapeHtml(station.code)}</span>
        </button>`).join('');
      box.querySelectorAll('.suggestion-item').forEach((button) => {
        button.addEventListener('click', () => selectStation(activeItems[Number(button.dataset.index)]));
      });
    }
    box.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    state[which] = null;
    codeInput.value = '';
    const query = input.value.trim();
    if (query.length < 2) { close(); return; }
    box.innerHTML = '<div class="suggestion-message">Searching stations…</div>';
    box.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stations?query=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Station search is unavailable.');
        const stations = await response.json();
        render(stations, 'No stations found. Try another name or station code.');
      } catch (error) {
        render([], error.message || 'Could not load stations. Please try again.');
      }
    }, 220);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2 && box.innerHTML.trim()) box.classList.add('open');
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Enter' && box.classList.contains('open')) {
      const first = box.querySelector('.suggestion-item');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#' + which + 'Field')) close();
  });
  return { close, selectStation };
}

const fromAutocomplete = setupStationAutocomplete('from');
const toAutocomplete = setupStationAutocomplete('to');

$('swapStations').addEventListener('click', () => {
  const from = state.from;
  const to = state.to;
  state.from = to;
  state.to = from;
  $('fromInput').value = to ? `${to.name} (${to.code})` : '';
  $('fromCode').value = to?.code || '';
  $('toInput').value = from ? `${from.name} (${from.code})` : '';
  $('toCode').value = from?.code || '';
});

function parseTime(value) {
  if (!value) return null;
  const parts = String(value).split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function journeyMinutes(train) {
  const start = parseTime(train.departureTime);
  const end = parseTime(train.arrivalTime);
  if (start === null || end === null) return null;
  const startDay = Number(train.startDay) || 1;
  const endDay = Number(train.endDay) || startDay;
  let duration = (endDay - startDay) * 1440 + end - start;
  if (duration < 0 && !train.endDay) duration += 1440;
  return duration >= 0 ? duration : null;
}

function formatTime(value) {
  if (!value) return '—';
  const mins = parseTime(value);
  if (mins === null) return '—';
  const hour = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDuration(minutes) {
  if (minutes === null) return 'Duration unavailable';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h ${mins}m`;
  return `${hours}h ${mins}m`;
}

function renderResults() {
  const type = $('typeFilter').value;
  const sort = $('sortBy').value;
  let results = state.trains.filter((train) => type === 'all' || (train.trainType || 'Other') === type);
  results = [...results].sort((a, b) => {
    if (sort === 'duration') return (journeyMinutes(a) ?? Infinity) - (journeyMinutes(b) ?? Infinity);
    if (sort === 'arrival') return (parseTime(a.arrivalTime) ?? Infinity) - (parseTime(b.arrivalTime) ?? Infinity);
    return (parseTime(a.departureTime) ?? Infinity) - (parseTime(b.departureTime) ?? Infinity);
  });
  $('resultsCount').textContent = `${results.length} ${results.length === 1 ? 'train' : 'trains'} found`;
  const container = $('trainResults');
  if (!results.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⌕</div><h3>No trains match this filter</h3><p>Try selecting another train type.</p></div>`;
    return;
  }
  container.innerHTML = results.map((train) => {
    const duration = journeyMinutes(train);
    const distance = Number(train.endDistance) - Number(train.startDistance);
    const distanceText = Number.isFinite(distance) && distance > 0 ? `${Math.round(distance)} km` : 'Timetable route';
    const trainNumber = escapeHtml(train.trainNumber);
    return `<article class="train-card">
      <div class="train-main">
        <div class="train-title-row"><span class="train-title">${escapeHtml(train.trainName)}</span><span class="train-number">${trainNumber}</span><span class="train-type">${escapeHtml(train.trainType || 'Train')}</span></div>
        <div class="journey-times">
          <div class="time-block"><strong>${formatTime(train.departureTime)}</strong><span>${escapeHtml(train.boardingStation || state.from?.name || '')}</span><small>${escapeHtml(state.from?.code || '')} · Day ${escapeHtml(train.startDay || '—')}</small></div>
          <div class="journey-duration">${formatDuration(duration)}<span>Journey duration</span></div>
          <div class="time-block"><strong>${formatTime(train.arrivalTime)}</strong><span>${escapeHtml(train.arrivalStation || state.to?.name || '')}</span><small>${escapeHtml(state.to?.code || '')} · Day ${escapeHtml(train.endDay || '—')}</small></div>
        </div>
      </div>
      <div class="train-actions"><div class="route-distance">${distanceText}</div><button class="schedule-button" data-train="${trainNumber}">View full schedule&nbsp; →</button></div>
    </article>`;
  }).join('');
  container.querySelectorAll('.schedule-button').forEach((button) => {
    button.addEventListener('click', () => openSchedule(button.dataset.train));
  });
}

async function searchTrains(event) {
  event.preventDefault();
  if (!state.from || !$('fromCode').value) { showToast('Please choose your source station from the suggestions.'); $('fromInput').focus(); return; }
  if (!state.to || !$('toCode').value) { showToast('Please choose your destination station from the suggestions.'); $('toInput').focus(); return; }
  if (state.from.code === state.to.code) { showToast('Source and destination cannot be the same.'); return; }
  const date = $('journeyDate').value;
  if (!date) { showToast('Please select your journey date.'); return; }

  const button = $('searchButton');
  button.disabled = true;
  button.querySelector('span').textContent = 'Searching…';
  $('resultsSection').hidden = false;
  $('resultsTitle').textContent = `${state.from.name} to ${state.to.name}`;
  $('resultsSubtitle').textContent = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('resultsCount').textContent = 'Finding matching trains…';
  $('trainResults').innerHTML = '<div class="loading-state"><div class="spinner"></div>Searching the railway timetable…</div>';
  $('typeFilter').innerHTML = '<option value="all">All types</option>';
  try {
    const url = `/api/trains/search?from=${encodeURIComponent(state.from.code)}&to=${encodeURIComponent(state.to.code)}&date=${encodeURIComponent(date)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Train search failed (${response.status}).`);
    }
    const trains = await response.json();
    state.trains = Array.isArray(trains) ? trains : [];
    const types = [...new Set(state.trains.map((train) => train.trainType).filter(Boolean))].sort();
    types.forEach((trainType) => $('typeFilter').add(new Option(trainType, trainType)));
    renderResults();
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    state.trains = [];
    $('resultsCount').textContent = 'Search could not be completed';
    $('trainResults').innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><h3>We couldn't load trains</h3><p>${escapeHtml(error.message || 'Please check that EasyTicket backend is running and try again.')}</p></div>`;
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Search trains';
  }
}

async function openSchedule(trainNumber) {
  if (!state.from || !state.to) return;
  $('scheduleModal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('scheduleTitle').textContent = `Train ${trainNumber}`;
  $('scheduleMeta').textContent = 'Loading complete route…';
  $('scheduleSummary').innerHTML = '';
  $('scheduleList').innerHTML = '<div class="loading-state"><div class="spinner"></div>Loading every station on this route…</div>';
  try {
    const url = `/api/trains/${encodeURIComponent(trainNumber)}/schedule?from=${encodeURIComponent(state.from.code)}&to=${encodeURIComponent(state.to.code)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `Schedule unavailable (${response.status}).`);
    }
    const stops = await response.json();
    if (!Array.isArray(stops) || !stops.length) throw new Error('No route stops were found for this train.');
    const first = stops[0];
    $('scheduleTitle').textContent = `${first.trainName || 'Train'} · ${trainNumber}`;
    $('scheduleMeta').textContent = `${first.sourceName || 'Origin'} (${first.sourceCode || ''}) → ${first.destinationName || 'Destination'} (${first.destinationCode || ''})`;
    $('scheduleSummary').innerHTML = `<span><strong>${stops.length}</strong> scheduled stops</span><span>Board at <strong>${escapeHtml(state.from.name)}</strong></span><span>Get down at <strong>${escapeHtml(state.to.name)}</strong></span>`;
    $('scheduleList').innerHTML = stops.map((stop) => {
      const boarding = Boolean(stop.boardingStop) || stop.stationCode === state.from.code;
      const alighting = Boolean(stop.alightingStop) || stop.stationCode === state.to.code;
      const labels = [boarding ? 'BOARDING' : '', alighting ? 'DESTINATION' : ''].filter(Boolean).join(' · ');
      return `<div class="schedule-stop ${boarding || alighting ? 'highlight' : ''}">
        <div class="station-cell"><span class="stop-marker"></span><span><strong>${escapeHtml(stop.stationName || 'Unknown station')}${labels ? `<span class="stop-badge">${labels}</span>` : ''}</strong><small>${escapeHtml(stop.stationCode || '—')} · Stop ${escapeHtml(stop.sequenceNumber ?? '—')} · Day ${escapeHtml(stop.journeyDay ?? '—')}</small></span></div>
        <span class="stop-time">${formatTime(stop.arrivalTime)}</span><span class="stop-time">${formatTime(stop.departureTime)}</span>
      </div>`;
    }).join('');
  } catch (error) {
    $('scheduleList').innerHTML = `<div class="empty-state"><h3>Could not load this schedule</h3><p>${escapeHtml(error.message || 'Please try again.')}</p></div>`;
  }
}

function closeSchedule() {
  $('scheduleModal').hidden = true;
  document.body.style.overflow = '';
}

$('searchForm').addEventListener('submit', searchTrains);
$('typeFilter').addEventListener('change', renderResults);
$('sortBy').addEventListener('change', renderResults);
$('modifySearch').addEventListener('click', () => $('search-section').scrollIntoView({ behavior: 'smooth' }));
$('closeSchedule').addEventListener('click', closeSchedule);
$('scheduleModal').addEventListener('click', (event) => { if (event.target === $('scheduleModal')) closeSchedule(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('scheduleModal').hidden) closeSchedule(); });
$('mobileMenu').addEventListener('click', () => {
  const nav = document.querySelector('.main-nav');
  const isOpen = nav.style.display === 'flex';
  nav.style.display = isOpen ? '' : 'flex';
  nav.style.position = isOpen ? '' : 'absolute';
  nav.style.top = isOpen ? '' : '67px';
  nav.style.left = isOpen ? '' : '0';
  nav.style.right = isOpen ? '' : '0';
  nav.style.padding = isOpen ? '' : '18px 22px';
  nav.style.background = isOpen ? '' : '#fff';
  nav.style.flexDirection = isOpen ? '' : 'column';
  nav.style.alignItems = isOpen ? '' : 'flex-start';
  nav.style.boxShadow = isOpen ? '' : '0 12px 22px #102b4e18';
});
