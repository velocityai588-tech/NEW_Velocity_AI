import { createClient } from '@supabase/supabase-client';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProjects() {
    try {
        const { data, error } = await supabase.from('projects').select('*');
        if (error) {
            console.error('Error:', error);
            return;
        }
        console.log('Total Projects:', data.length);
        const stats = data.reduce((acc, p) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
        }, {});
        console.log('Project Status Stats:', stats);
        console.log('Sample Project:', data[0]);
    } catch (e) {
        console.error('Failed:', e);
    }
}

checkProjects();
