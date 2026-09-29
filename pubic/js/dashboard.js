const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token || !user.id) {
  window.location.href = '/login.html';
}

document.getElementById('userName').textContent = user.full_name || 'Member';
document.getElementById('userRole').textContent = user.role || 'member';
document.getElementById('userJoined').textContent = user.joined_at || 'N/A';

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/login.html';
});

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized');
      throw new Error('Failed to fetch');
    }
    const data = await res.json();
    renderContributions(data.contributions);
    renderPayments(data.payments || []);
    renderSummary(data.summary || {});
    if (user.role === 'admin') {
      document.getElementById('membersList').style.display = 'block';
      loadMembers();
    }
  } catch (err) {
    console.error(err);
    localStorage.clear();
    window.location.href = '/login.html';
  }
}

function renderContributions(contributions) {
  const list = document.getElementById('contributionList');
  list.innerHTML = '';
  if (contributions.length === 0) {
    list.innerHTML = '<li>No contributions yet.</li>';
    return;
  }
  contributions.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `💰 UGX ${Number(c.amount).toLocaleString()} on ${new Date(c.date).toLocaleDateString()}`;
    list.appendChild(li);
  });
}

function renderSummary(summary) {
  const membershipStatus = document.getElementById('membershipStatus');
  const totalShares = document.getElementById('totalShares');
  const shareBalance = document.getElementById('shareBalance');

  if (membershipStatus) membershipStatus.textContent = summary.membership_status || 'Pending';
  if (totalShares) totalShares.textContent = `UGX ${Number(summary.total_shares || 0).toLocaleString()}`;
  if (shareBalance) shareBalance.textContent = `UGX ${Number(summary.share_balance || 0).toLocaleString()}`;
}

function renderPayments(payments) {
  const list = document.getElementById('paymentHistoryList');
  if (!list) return;
  list.innerHTML = '';

  if (!payments.length) {
    list.innerHTML = '<li>No payment records yet.</li>';
    return;
  }

  payments.forEach((payment) => {
    const li = document.createElement('li');
    const paymentDate = new Date(payment.created_at || Date.now()).toLocaleString();
    const statusLabel = payment.status === 'successful' ? 'Confirmed' : payment.status === 'failed' ? 'Failed' : 'Pending';
    li.innerHTML = `
      <strong>${payment.package_name}</strong>
      <span>UGX ${Number(payment.amount).toLocaleString()} • ${payment.method}</span>
      <small>${statusLabel} • ${payment.reference}</small>
      <small>${paymentDate}</small>
    `;

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.textContent = payment.status === 'successful' ? 'Confirmed' : 'Confirm payment';
    confirmButton.disabled = payment.status === 'successful';
    confirmButton.addEventListener('click', async () => {
      if (payment.status === 'successful') return;
      try {
        const res = await fetch(`/api/payments/${payment.id}/confirm`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Confirmation failed');
        await loadDashboard();
      } catch (err) {
        console.error(err);
      }
    });

    li.appendChild(confirmButton);
    list.appendChild(li);
  });
}

async function loadMembers() {
  try {
    const res = await fetch('/api/members', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch members');
    const members = await res.json();
    const container = document.getElementById('membersContainer');
    container.innerHTML = '';
    members.forEach(m => {
      const li = document.createElement('li');
      li.textContent = `${m.full_name} (${m.email}) - ${m.role}`;
      container.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('addContributionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = document.getElementById('contributionAmount').value;
  const msg = document.getElementById('contributionMessage');
  try {
    const res = await fetch('/api/contributions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'Failed to add contribution';
      msg.style.color = '#dc2626';
      return;
    }
    msg.textContent = '✅ Contribution added!';
    msg.style.color = '#16a34a';
    document.getElementById('contributionAmount').value = '';
    loadDashboard();
  } catch (err) {
    msg.textContent = 'Server error';
    msg.style.color = '#dc2626';
  }
});

document.getElementById('paymentFormDashboard').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = Number(document.getElementById('dashboardPaymentAmount').value);
  const method = document.getElementById('dashboardPaymentMethod').value;
  const packageName = document.getElementById('dashboardPaymentType').value;
  const msg = document.getElementById('dashboardPaymentMessage');

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount, method, package_name: packageName, status: 'pending' })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.error || 'Payment request failed';
      msg.style.color = '#dc2626';
      return;
    }

    msg.textContent = `Payment request created. Status: pending. Reference: ${data.reference}. Waiting for provider confirmation.`;
    msg.style.color = '#0a3d62';
    document.getElementById('dashboardPaymentAmount').value = '';
    await loadDashboard();
  } catch (err) {
    msg.textContent = 'Server error';
    msg.style.color = '#dc2626';
  }
});

loadDashboard();