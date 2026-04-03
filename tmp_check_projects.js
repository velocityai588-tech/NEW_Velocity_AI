const { createClient } = require('@supabase/supabase-client');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProjects() {
    const { data, error } = await supabase.from('projects').select('id, name, status, organization_id');
    if (error) {
        console.error(error);
        return;
    }
    console.log('Projects found:', data.length);
    console.log('Project statuses:', [...new Set(data.map(p => p.status))]);
    console.log('Sample projects:', data.slice(0, 5));
}

checkProjects();
