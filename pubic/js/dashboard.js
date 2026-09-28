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

// Fetch dashboard data
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
    li.textContent = `💰 $${c.amount} on ${new Date(c.date).toLocaleDateString()}`;
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

// Add contribution
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
    loadDashboard(); // refresh list
  } catch (err) {
    msg.textContent = 'Server error';
    msg.style.color = '#dc2626';
  }
});

loadDashboard();