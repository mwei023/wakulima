import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://gasfvwnmbdjtpbgcltvi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhc2Z2d25tYmRqdHBiZ2NsdHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1ODM2ODYsImV4cCI6MjA3MzE1OTY4Nn0.2JLvHNm8gJm-7PZq4OrBMiMENdv5ExNegISweNJMHgk";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function confirmStores() {
  console.log('Confirming stores in the system...\n');

  try {
    const { data, error } = await supabase.from('stores').select('*');

    if (error) {
      console.log(`❌ Error fetching stores: ${error.message}`);
    } else {
      console.log(`✅ Found ${data.length} store(s):`);
      data.forEach(store => {
        console.log(`  - ID: ${store.id}`);
        console.log(`    Name: ${store.name}`);
        console.log(`    Location: ${store.location || 'N/A'}`);
        console.log(`    Created At: ${store.created_at}`);
        console.log('');
      });
    }
  } catch (err) {
    console.error('Error during confirmation:', err);
  }
}

confirmStores();
