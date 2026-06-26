document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_CONFIG = 'pontoConfig';
    const STORAGE_AUTH = 'pontoAuth';
    const WEEKDAY_MINUTES = 9 * 60;
    const FRIDAY_MINUTES = 8 * 60;

    let config = {
        toleranciaMinutos: 10
    };

    let auth = null;
    let records = {};
    let currentDate = new Date();
    currentDate.setDate(1);

    const authScreen = document.getElementById('auth-screen');
    const authForm = document.getElementById('auth-form');
    const authName = document.getElementById('auth-name');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authSubmit = document.getElementById('auth-submit');
    const authMsg = document.getElementById('auth-msg');
    const currentUserName = document.getElementById('current-user-name');

    const tableBody = document.getElementById('table-body');
    const summaryBody = document.getElementById('summary-body');
    const monthTitle = document.getElementById('month-title');
    const summaryTitle = document.getElementById('summary-title');

    const monthExpected = document.getElementById('month-expected');
    const monthWorked = document.getElementById('month-worked');
    const monthBalance = document.getElementById('month-balance');
    const monthDelay = document.getElementById('month-delay');
    const monthFilled = document.getElementById('month-filled');
    const sidebarBalance = document.getElementById('sidebar-balance-val');

    const yearBalance = document.getElementById('year-balance');
    const yearWorked = document.getElementById('year-worked');
    const yearDelay = document.getElementById('year-delay');
    const yearDays = document.getElementById('year-days');

    const cfgTolerancia = document.getElementById('cfg-tolerancia');
    const cfgSegQui = document.getElementById('cfg-seg-qui');
    const cfgSexta = document.getElementById('cfg-sexta');

    function loadConfig() {
        const saved = localStorage.getItem(STORAGE_CONFIG);
        if (!saved) return;

        try {
            const savedConfig = JSON.parse(saved);
            config = {
                ...config,
                toleranciaMinutos: savedConfig.toleranciaMinutos ?? config.toleranciaMinutos
            };
        } catch {
            saveConfig();
        }
    }

    function saveConfig() {
        localStorage.setItem(STORAGE_CONFIG, JSON.stringify(config));
    }

    function loadAuth() {
        const saved = localStorage.getItem(STORAGE_AUTH);
        if (!saved) return null;

        try {
            return JSON.parse(saved);
        } catch {
            localStorage.removeItem(STORAGE_AUTH);
            return null;
        }
    }

    function saveAuth(nextAuth) {
        auth = nextAuth;
        localStorage.setItem(STORAGE_AUTH, JSON.stringify(nextAuth));
    }

    function clearAuth() {
        auth = null;
        records = {};
        localStorage.removeItem(STORAGE_AUTH);
    }

    async function api(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (auth?.token) {
            headers.Authorization = `Bearer ${auth.token}`;
        }

        const response = await fetch(path, {
            ...options,
            headers
        });

        if (response.status === 204) return null;

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível concluir a ação.');
        }

        return data;
    }

    function showAuth(message = '') {
        document.body.classList.remove('app-ready');
        authScreen.classList.remove('hidden');
        authMsg.textContent = message;
        if (message) authMsg.classList.add('error');
        currentUserName.textContent = '-';
    }

    async function showApp() {
        document.body.classList.add('app-ready');
        authScreen.classList.add('hidden');
        currentUserName.textContent = auth.user.name;
        await loadRemoteRecords();
        refresh();
    }

    async function loadRemoteRecords() {
        const data = await api('/api/records');
        records = {};

        data.records.forEach(record => {
            const date = new Date(`${record.date}T00:00:00`);
            records[record.date] = normalizeRecord(record, date);
        });
    }

    function syncConfigFields() {
        cfgTolerancia.value = config.toleranciaMinutos;
        cfgSegQui.value = '9';
        cfgSexta.value = '8';
    }

    function setupTabs() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

                item.classList.add('active');
                document.getElementById(`tab-${item.dataset.tab}`).classList.add('active');

                if (item.dataset.tab === 'resumo') renderSummary();
            });
        });
    }

    function setupAuth() {
        let mode = 'login';

        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                mode = tab.dataset.authMode;
                document.querySelectorAll('.auth-tab').forEach(item => item.classList.remove('active'));
                tab.classList.add('active');
                authForm.classList.toggle('register-mode', mode === 'register');
                authName.required = mode === 'register';
                authSubmit.textContent = mode === 'register' ? 'Criar conta' : 'Entrar';
                authMsg.textContent = '';
                authMsg.classList.remove('error');
            });
        });

        authForm.addEventListener('submit', async event => {
            event.preventDefault();
            authSubmit.disabled = true;
            authMsg.textContent = mode === 'register' ? 'Criando conta...' : 'Entrando...';
            authMsg.classList.remove('error');

            try {
                const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
                const payload = {
                    email: authEmail.value,
                    password: authPassword.value
                };

                if (mode === 'register') payload.name = authName.value;

                const data = await api(path, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                saveAuth(data);
                authForm.reset();
                await showApp();
            } catch (error) {
                authMsg.textContent = error.message;
                authMsg.classList.add('error');
            } finally {
                authSubmit.disabled = false;
            }
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            clearAuth();
            showAuth();
        });
    }

    function renderMonth() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();

        monthTitle.textContent = currentDate
            .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
            .replace(/^./, char => char.toUpperCase());

        tableBody.innerHTML = '';

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = toDateKey(date);
            const record = normalizeRecord(records[dateStr], date);
            const expectedMinutes = getExpectedMinutes(date);

            const row = document.createElement('tr');
            if (isWeekend(date)) row.classList.add('weekend');

            row.innerHTML = `
                <td>${formatDate(date)}</td>
                <td>${date.toLocaleString('pt-BR', { weekday: 'short' }).replace('.', '')}</td>
                <td>${formatDuration(expectedMinutes)}</td>
                <td><input type="text" class="input-worked" value="${escapeHtml(record.worked || '')}" placeholder="9:00"></td>
                <td class="saldo-cell">${record.balance !== undefined ? formatBalance(record.balance) : '-'}</td>
                <td class="delay-cell">${record.delay !== undefined ? formatDuration(record.delay) : '-'}</td>
                <td><input type="text" class="input-obs" value="${escapeHtml(record.obs || '')}" placeholder="Observação..."></td>
                <td><button class="btn-clear" type="button" title="Limpar dia">×</button></td>
            `;

            const workedInput = row.querySelector('.input-worked');
            const obsInput = row.querySelector('.input-obs');

            workedInput.addEventListener('change', () => calculateDay(row, dateStr, expectedMinutes));
            obsInput.addEventListener('change', () => saveObservation(dateStr, obsInput.value));

            row.querySelector('.btn-clear').addEventListener('click', async () => {
                if (!records[dateStr]) return;

                if (confirm('Limpar este dia?')) {
                    await deleteDay(dateStr);
                }
            });

            tableBody.appendChild(row);
            applyBalanceClass(row.querySelector('.saldo-cell'), record.balance);
            applyDelayClass(row.querySelector('.delay-cell'), record.delay);
        }

        updateTotals();
    }

    async function calculateDay(row, dateStr, expectedMinutes) {
        const workedInput = row.querySelector('.input-worked');
        const obsInput = row.querySelector('.input-obs');
        const saldoCell = row.querySelector('.saldo-cell');
        const delayCell = row.querySelector('.delay-cell');

        if (workedInput.value.trim() === '') {
            await deleteDay(dateStr);
            return;
        }

        try {
            const workedMinutes = timeToMinutes(workedInput.value);
            const balance = applyTolerance(workedMinutes - expectedMinutes);
            const delay = Math.max(0, -balance);
            const worked = normalizeTime(workedInput.value);

            await api(`/api/records/${dateStr}`, {
                method: 'PUT',
                body: JSON.stringify({
                    worked,
                    obs: obsInput.value.trim()
                })
            });

            records[dateStr] = {
                date: dateStr,
                worked,
                workedMinutes,
                balance,
                delay,
                obs: obsInput.value.trim()
            };

            workedInput.value = worked;
            saldoCell.textContent = formatBalance(balance);
            delayCell.textContent = formatDuration(delay);
            applyBalanceClass(saldoCell, balance);
            applyDelayClass(delayCell, delay);
            updateTotals();
        } catch (error) {
            alert(error.message);
        }
    }

    async function saveObservation(dateStr, value) {
        if (!records[dateStr]) return;

        try {
            await api(`/api/records/${dateStr}/obs`, {
                method: 'PATCH',
                body: JSON.stringify({ obs: value })
            });

            records[dateStr].obs = value.trim();
        } catch (error) {
            alert(error.message);
        }
    }

    async function deleteDay(dateStr) {
        try {
            await api(`/api/records/${dateStr}`, { method: 'DELETE' });
            delete records[dateStr];
            refresh();
        } catch (error) {
            alert(error.message);
        }
    }

    function updateTotals() {
        const monthStats = getMonthStats(currentDate.getFullYear(), currentDate.getMonth());
        const yearStats = getYearStats(currentDate.getFullYear());
        const allBalance = Object.entries(records).reduce((total, [dateStr, record]) => {
            const date = new Date(`${dateStr}T00:00:00`);
            return total + normalizeRecord(record, date).balance;
        }, 0);

        monthExpected.textContent = formatDuration(monthStats.expected);
        monthWorked.textContent = formatDuration(monthStats.worked);
        monthBalance.textContent = formatBalance(monthStats.balance);
        monthDelay.textContent = formatDuration(monthStats.delay);
        monthFilled.textContent = String(monthStats.days);
        applyBalanceClass(monthBalance, monthStats.balance);
        applyDelayClass(monthDelay, monthStats.delay);

        sidebarBalance.textContent = formatBalance(allBalance);
        applyBalanceClass(sidebarBalance, allBalance);

        yearBalance.textContent = formatBalance(yearStats.balance);
        yearWorked.textContent = formatDuration(yearStats.worked);
        yearDelay.textContent = formatDuration(yearStats.delay);
        yearDays.textContent = String(yearStats.days);
        applyBalanceClass(yearBalance, yearStats.balance);
        applyDelayClass(yearDelay, yearStats.delay);

        renderSummary();
    }

    function renderSummary() {
        const year = currentDate.getFullYear();
        summaryTitle.textContent = `Resumo de ${year}`;
        summaryBody.innerHTML = '';

        for (let month = 0; month < 12; month++) {
            const date = new Date(year, month, 1);
            const stats = getMonthStats(year, month);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${date.toLocaleString('pt-BR', { month: 'long' }).replace(/^./, char => char.toUpperCase())}</td>
                <td>${formatDuration(stats.expected)}</td>
                <td>${formatDuration(stats.worked)}</td>
                <td class="saldo-cell">${formatBalance(stats.balance)}</td>
                <td class="delay-cell">${formatDuration(stats.delay)}</td>
                <td>${stats.days}</td>
            `;

            applyBalanceClass(row.querySelector('.saldo-cell'), stats.balance);
            applyDelayClass(row.querySelector('.delay-cell'), stats.delay);
            summaryBody.appendChild(row);
        }
    }

    function getMonthStats(year, month) {
        let expected = 0;
        let worked = 0;
        let balance = 0;
        let delay = 0;
        let days = 0;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateStr = toDateKey(date);
            const record = normalizeRecord(records[dateStr], date);

            expected += getExpectedMinutes(date);

            if (record.worked) {
                worked += record.workedMinutes;
                balance += record.balance;
                delay += record.delay;
                days += 1;
            }
        }

        return { expected, worked, balance, delay, days };
    }

    function getYearStats(year) {
        let worked = 0;
        let balance = 0;
        let delay = 0;
        let days = 0;

        Object.entries(records).forEach(([dateStr, storedRecord]) => {
            if (!dateStr.startsWith(`${year}-`)) return;

            const date = new Date(`${dateStr}T00:00:00`);
            const record = normalizeRecord(storedRecord, date);
            if (!record.worked) return;

            worked += record.workedMinutes;
            balance += record.balance;
            delay += record.delay;
            days += 1;
        });

        return { worked, balance, delay, days };
    }

    function normalizeRecord(record, date) {
        if (!record || !record.worked) return {};

        const workedMinutes = Number.isFinite(record.workedMinutes)
            ? record.workedMinutes
            : timeToMinutes(record.worked);
        const balance = Number.isFinite(record.balance)
            ? record.balance
            : applyTolerance(workedMinutes - getExpectedMinutes(date));

        return {
            ...record,
            workedMinutes,
            balance,
            delay: Math.max(0, -balance)
        };
    }

    function getExpectedMinutes(date) {
        const weekday = date.getDay();
        if (weekday === 0 || weekday === 6) return 0;
        if (weekday === 5) return FRIDAY_MINUTES;
        return WEEKDAY_MINUTES;
    }

    function applyTolerance(minutes) {
        if (minutes !== 0 && Math.abs(minutes) <= config.toleranciaMinutos) return 0;
        return minutes;
    }

    function timeToMinutes(timeStr) {
        const clean = String(timeStr || '').trim().replace(',', '.');
        if (!clean) return 0;

        if (clean.includes(':')) {
            const [hours, minutes = '0'] = clean.split(':');
            return (parseInt(hours, 10) || 0) * 60 + (parseInt(minutes, 10) || 0);
        }

        const decimalHours = parseFloat(clean);
        if (!Number.isNaN(decimalHours) && clean.includes('.')) {
            return Math.round(decimalHours * 60);
        }

        return (parseInt(clean, 10) || 0) * 60;
    }

    function normalizeTime(timeStr) {
        const minutes = timeToMinutes(timeStr);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${String(mins).padStart(2, '0')}`;
    }

    function formatBalance(minutes = 0) {
        if (minutes === 0) return '0min';
        return `${minutes > 0 ? '+' : '-'}${formatDuration(Math.abs(minutes))}`;
    }

    function formatDuration(minutes = 0) {
        const abs = Math.abs(minutes);
        const hours = Math.floor(abs / 60);
        const mins = abs % 60;

        if (hours === 0) return `${mins}min`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h ${mins}min`;
    }

    function formatDate(date) {
        return date.toLocaleDateString('pt-BR');
    }

    function toDateKey(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function isWeekend(date) {
        return date.getDay() === 0 || date.getDay() === 6;
    }

    function applyBalanceClass(element, balance = 0) {
        element.classList.remove('saldo-pos', 'saldo-neg', 'saldo-zero');

        if (balance > 0) element.classList.add('saldo-pos');
        else if (balance < 0) element.classList.add('saldo-neg');
        else element.classList.add('saldo-zero');
    }

    function applyDelayClass(element, delay = 0) {
        element.classList.toggle('saldo-neg', delay > 0);
        element.classList.toggle('saldo-zero', delay <= 0);
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function refresh() {
        renderMonth();
        renderSummary();
        updateTotals();
    }

    function exportCsv(scope) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const rows = [['Data', 'Dia', 'Previsto', 'Horas trabalhadas', 'Saldo', 'Atraso', 'Observação']];

        Object.keys(records).sort().forEach(dateStr => {
            const date = new Date(`${dateStr}T00:00:00`);
            const sameYear = date.getFullYear() === year;
            const sameMonth = date.getMonth() === month;

            if (scope === 'month' && (!sameYear || !sameMonth)) return;
            if (scope === 'year' && !sameYear) return;

            const record = normalizeRecord(records[dateStr], date);
            const expected = getExpectedMinutes(date);

            rows.push([
                formatDate(date),
                date.toLocaleString('pt-BR', { weekday: 'short' }).replace('.', ''),
                formatDuration(expected),
                formatDuration(record.workedMinutes),
                formatBalance(record.balance),
                formatDuration(record.delay),
                record.obs || ''
            ]);
        });

        const csv = rows.map(row => row.map(csvCell).join(';')).join('\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const suffix = scope === 'year'
            ? String(year)
            : `${year}-${String(month + 1).padStart(2, '0')}`;

        link.href = URL.createObjectURL(blob);
        link.download = `ponto-${suffix}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function csvCell(value) {
        return `"${String(value).replaceAll('"', '""')}"`;
    }

    function recalculateRecords() {
        Object.entries(records).forEach(([dateStr, record]) => {
            if (!record.worked) return;

            const date = new Date(`${dateStr}T00:00:00`);
            const workedMinutes = timeToMinutes(record.worked);
            const balance = applyTolerance(workedMinutes - getExpectedMinutes(date));

            records[dateStr] = {
                ...record,
                workedMinutes,
                balance,
                delay: Math.max(0, -balance)
            };
        });
    }

    document.getElementById('btn-prev-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        refresh();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        refresh();
    });

    document.getElementById('btn-current-month').addEventListener('click', () => {
        currentDate = new Date();
        currentDate.setDate(1);
        refresh();
    });

    document.getElementById('btn-export').addEventListener('click', () => exportCsv('month'));
    document.getElementById('btn-export-year').addEventListener('click', () => exportCsv('year'));

    document.getElementById('btn-save-cfg').addEventListener('click', () => {
        config.toleranciaMinutos = parseInt(cfgTolerancia.value, 10) || 0;

        recalculateRecords();
        saveConfig();
        refresh();

        const msg = document.getElementById('cfg-msg');
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 2500);
    });

    async function init() {
        loadConfig();
        syncConfigFields();
        setupTabs();
        setupAuth();

        const savedAuth = loadAuth();
        if (!savedAuth?.token) {
            showAuth();
            return;
        }

        auth = savedAuth;

        try {
            const data = await api('/api/auth/me');
            auth.user = data.user;
            saveAuth(auth);
            await showApp();
        } catch {
            clearAuth();
            showAuth('Entre novamente para continuar.');
        }
    }

    init();
});
