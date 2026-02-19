import fetch from 'node-fetch';

const url = 'http://localhost:4000/api/v1/analyze/capacity';
const body = {
  candidates: [
    {
      id: 'u1',
      name: 'Alex',
      current_load: 10,
      skills: ['React'],
      role_level: 'senior',
      avg_completion_time: 8,
      efficiency_score: 1,
      base_productive_hours: 40,
      pto_hours_this_week: 8,
      holiday_hours_this_week: 0,
    },
    {
      id: 'u2',
      name: 'Emma',
      current_load: 20,
      skills: ['DevOps'],
      role_level: 'mid',
      avg_completion_time: 10,
      efficiency_score: 0.9,
      base_productive_hours: 40,
      pto_hours_this_week: 0,
      holiday_hours_this_week: 0,
    }
  ]
};

(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log('HTTP', res.status);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch (e) {
      console.log('Response text:', text);
    }
  } catch (err) {
    console.error('Request error:', err);
  }
})();