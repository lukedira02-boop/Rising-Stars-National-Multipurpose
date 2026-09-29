const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginMsg = document.getElementById('loginMessage');
const regMsg = document.getElementById('regMessage');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (!res.ok) {
        loginMsg.textContent = data.error || 'Login failed';
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/dashboard.html';
    } catch (err) {
      loginMsg.textContent = 'Server error';
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, email, phone, password })
      });
      const data = await res.json();
      if (!res.ok) {
        regMsg.textContent = data.error || 'Registration failed';
        regMsg.style.color = '#b33b3b';
        return;
      }
      regMsg.textContent = 'Registration successful! You can now login.';
      regMsg.style.color = '#16a34a';
      registerForm.reset();
    } catch (err) {
      regMsg.textContent = 'Server error';
      regMsg.style.color = '#b33b3b';
    }
  });
}