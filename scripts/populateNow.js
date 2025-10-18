import { populateDatabase } from './populateProducts.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for local development
const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseKey);

// Store ID from the schema
const storeId = '9ddf957b-327f-4b93-9374-7455d2a7480b';

async function main() {
  console.log('Starting product population...');

  try {
    const result = await populateDatabase(supabase, storeId);
    console.log(`Population complete!`);
    console.log(`Success: ${result.successCount} products`);
    console.log(`Errors: ${result.errorCount} products`);
  } catch (error) {
    console.error('Population failed:', error);
    process.exit(1);
  }
}

main();
