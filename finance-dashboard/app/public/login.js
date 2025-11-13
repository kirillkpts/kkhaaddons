document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember')?.checked || false;
  const msg = document.getElementById('msg');
  msg.textContent = '';
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember })
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        msg.textContent = json.error || 'Неверный логин или пароль';
      } catch {
        msg.textContent = 'Неверный логин или пароль';
      }
      return;
    }
    location.href = '/';
  } catch (err) {
    msg.textContent = 'Не удалось выполнить вход';
  }
});

