const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('.main-nav');

if (menuToggle && mainNav) {
	menuToggle.addEventListener('click', () => {
		const isOpen = mainNav.classList.toggle('is-open');
		menuToggle.setAttribute('aria-expanded', String(isOpen));
		menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
	});

	mainNav.querySelectorAll('a').forEach((link) => {
		link.addEventListener('click', () => {
			mainNav.classList.remove('is-open');
			menuToggle.setAttribute('aria-expanded', 'false');
			menuToggle.setAttribute('aria-label', 'Open navigation');
		});
	});
}

const joinForm = document.getElementById('joinForm');
const joinMessage = document.getElementById('joinMessage');

if (joinForm && joinMessage) {
	joinForm.addEventListener('submit', async (event) => {
		event.preventDefault();
		const formData = new FormData(joinForm);
		const details = Object.fromEntries(formData.entries());
		joinMessage.textContent = 'Sending your registration...';
		joinMessage.style.color = '#0a3d62';

		try {
			const response = await fetch('/api/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(details)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Registration failed');
			joinForm.reset();
			joinMessage.textContent = 'Registration received. You can now sign in from Member login.';
			joinMessage.style.color = '#18794e';
		} catch (error) {
			joinMessage.textContent = error.message === 'Failed to fetch' ? 'The server is unavailable. Please try WhatsApp instead.' : error.message;
			joinMessage.style.color = '#b33b3b';
		}
	});
}

const paymentChoices = document.querySelectorAll('.payment-choice');
const selectedMethod = document.getElementById('selectedMethod');
const paymentForm = document.getElementById('paymentForm');
const paymentMessage = document.getElementById('paymentMessage');

paymentChoices.forEach((choice) => {
	choice.addEventListener('click', () => {
		paymentChoices.forEach((item) => item.classList.remove('is-selected'));
		choice.classList.add('is-selected');
		if (selectedMethod) selectedMethod.textContent = choice.dataset.method;
	});
});

if (paymentForm && paymentMessage) {
	paymentForm.addEventListener('submit', (event) => {
		event.preventDefault();
		const amount = document.getElementById('paymentAmount').value;
		const method = selectedMethod ? selectedMethod.textContent : 'your selected method';
		paymentMessage.textContent = `Payment request ready for UGX ${Number(amount).toLocaleString()} via ${method}. The Treasurer will confirm the next step.`;
	});
}

const eventDate = new Date('2026-10-15T10:00:00+03:00');
const countdownLabel = document.getElementById('countdownLabel');
const countdownFields = {
	days: document.getElementById('countDays'),
	hours: document.getElementById('countHours'),
	minutes: document.getElementById('countMinutes'),
	seconds: document.getElementById('countSeconds')
};

if (countdownLabel && countdownFields.days) {
	countdownLabel.textContent = `15 October 2026 · 10:00 EAT`;
	const updateCountdown = () => {
		const remaining = Math.max(0, eventDate.getTime() - Date.now());
		const days = Math.floor(remaining / 86400000);
		const hours = Math.floor((remaining % 86400000) / 3600000);
		const minutes = Math.floor((remaining % 3600000) / 60000);
		const seconds = Math.floor((remaining % 60000) / 1000);
		countdownFields.days.textContent = String(days).padStart(2, '0');
		countdownFields.hours.textContent = String(hours).padStart(2, '0');==-
		countdownFields.minutes.textContent = String(minutes).padStart(2, '0');
		countdownFields.seconds.textContent = String(seconds).padStart(2, '0');
	};
	updateCountdown();
	setInterval(updateCountdown, 1000);
}