import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://gasfvwnmbdjtpbgcltvi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhc2Z2d25tYmRqdHBiZ2NsdHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1ODM2ODYsImV4cCI6MjA3MzE1OTY4Nn0.2JLvHNm8gJm-7PZq4OrBMiMENdv5ExNegISweNJMHgk";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function verifyTables() {
  const expectedTables = [
    'categories',
    'products_master',
    'stores',
    'store_inventory',
    'customers',
    'sales',
    'sale_items',
    'pending_orders',
    'profiles',
    'user_roles',
    'user_stores'
  ];

  const expectedViews = ['products'];

  console.log('Verifying tables and views in the database...\n');

  try {
    // Check tables
    for (const table of expectedTables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
          console.log(`❌ Table '${table}' does not exist or has issues: ${error.message}`);
        } else {
          console.log(`✅ Table '${table}' exists`);
        }
      } catch (err) {
        console.log(`❌ Error checking table '${table}': ${err.message}`);
      }
    }

    // Check views (views can be queried similarly)
    for (const view of expectedViews) {
      try {
        const { data, error } = await supabase.from(view).select('*').limit(1);
        if (error) {
          console.log(`❌ View '${view}' does not exist or has issues: ${error.message}`);
        } else {
          console.log(`✅ View '${view}' exists`);
        }
      } catch (err) {
        console.log(`❌ Error checking view '${view}': ${err.message}`);
      }
    }

    console.log('\nVerification complete.');
  } catch (err) {
    console.error('Error during verification:', err);
  }
}

verifyTables();
