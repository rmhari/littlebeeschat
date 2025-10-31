(async function () {
    // ===== Session =====
    const sres = await fetch('/session');
    const ses = await sres.json();
    if (!ses.ok) {
        window.location = '/login.html';
        return;
    }

    const { username, room } = ses.user;

    // ===== UI Elements =====
    document.getElementById('roomName').textContent = room;
    document.getElementById('youLabel').textContent = username;
    const messagesEl = document.getElementById('messages');
    const msgForm = document.getElementById('msgForm');
    const msgInput = document.getElementById('msgInput');
    const typingIndicator = document.getElementById('typingIndicator');

    const socket = io();
    socket.emit('joinRoom', { room, username });

    const myMessages = new Map(); // messageId -> tick span

    function genId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function appendSystem(text) {
        const el = document.createElement('div');
        el.className = 'system';
        el.textContent = text;
        messagesEl.appendChild(el);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendMessage({ username: from, text, id }) {
        // Prevent duplicates
        if (messagesEl.querySelector(`[data-msgid="${id}"]`)) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'msg ' + (from === username ? 'me' : 'other');
        wrapper.dataset.msgid = id || '';

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML =
            from === username
                ? `<span class="sender you">You</span>`
                : `<span class="sender other">${from}</span>`;

        const body = document.createElement('div');
        body.className = 'text';
        body.textContent = text;
        wrapper.appendChild(meta);
        wrapper.appendChild(body);

        // tick only for own messages
        if (from === username) {
            const tick = document.createElement('span');
            tick.className = 'tick single';
            tick.title = 'Delivered';
            wrapper.appendChild(tick);
            if (id) myMessages.set(id, tick);
        }

        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // emit seen event if message from other user
        if (from !== username && id) {
            socket.emit('messageSeen', { room, messageId: id, seenBy: username });
        }
    }

    // ===== Socket events =====
    socket.on('roomFull', () => {
        alert('Room already has two participants. Cannot join.');
        window.location = '/login.html';
    });

    socket.on('joined', ({ participants }) => {
        appendSystem(`Joined: ${participants.join(', ')}`);
    });

    socket.on('userJoined', ({ username: who }) => {
        appendSystem(`${who} joined.`);
    });

    socket.on('userLeft', ({ username: who }) => {
        appendSystem(`${who} left.`);
    });

    socket.on('message', (m) => {
        appendMessage(m);
    });

    socket.on('messageSeen', ({ messageId, seenBy }) => {
        const tick = myMessages.get(messageId);
        if (tick) {
            tick.classList.remove('single');
            tick.classList.add('double');
            tick.title = `Seen by ${seenBy}`;
        }
    });

    // ===== Typing Indicator =====
    let typingUsers = new Set();

    socket.on('typing', ({ username: who }) => {
        if (who === username) return;
        typingUsers.add(who);
        updateTypingIndicator();
    });

    socket.on('stopTyping', ({ username: who }) => {
        if (who === username) return;
        typingUsers.delete(who);
        updateTypingIndicator();
    });

    function updateTypingIndicator() {
        if (typingUsers.size === 0) {
            typingIndicator.style.display = 'none';
            typingIndicator.textContent = '';
        } else {
            typingIndicator.style.display = 'block';
            typingIndicator.textContent =
                [...typingUsers].join(', ') + ' is typing…';
        }
    }

    // ===== Typing Logic =====
    let typingTimer = null;
    const TYPING_TIMEOUT = 2000;

    function startTyping() {
        socket.emit('typing', { room, username });
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('stopTyping', { room, username });
            typingTimer = null;
        }, TYPING_TIMEOUT);
    }

    msgInput.addEventListener('input', () => {
        startTyping();
    });

    msgForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = msgInput.value.trim();
        if (!text) return;
        const id = genId();

        appendMessage({ username, text, id });
        socket.emit('message', { room, username, text, id });

        msgInput.value = '';
        if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
            socket.emit('stopTyping', { room, username });
        }
    });

    // ===== Logout =====
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/logout', { method: 'POST' });
        window.location = '/login.html';
    });

    // ===== When window refocuses, mark all messages seen =====
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const otherMsgs = messagesEl.querySelectorAll('.msg.other');
            otherMsgs.forEach((m) => {
                const id = m.dataset.msgid;
                if (id) {
                    socket.emit('messageSeen', { room, messageId: id, seenBy: username });
                }
            });
        }
    });
})();
