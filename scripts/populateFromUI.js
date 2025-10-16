// Script to help populate products through the UI
import { parsedProducts } from './populateProducts.js';

console.log(`Ready to populate ${parsedProducts.length} products through the UI`);
console.log('Sample products:');
console.log(parsedProducts.slice(0, 5));

// Function to generate batch insert commands for manual execution
export function generateBatchInsertSQL(products, storeId = '9ddf957b-327f-4b93-9374-7455d2a7480b') {
  const categories = [...new Set(products.map(p => p.category))];
  let sql = '';

  // Insert categories
  sql += '-- Insert categories\n';
  categories.forEach(cat => {
    sql += `INSERT INTO categories (name) VALUES ('${cat}') ON CONFLICT (name) DO NOTHING;\n`;
  });

  sql += '\n-- Insert products\n';
  products.forEach(product => {
    const masterId = crypto.randomUUID();
    sql += `INSERT INTO products_master (id, name, category, unit, selling_price, cost_price, barcode) VALUES ('${masterId}', '${product.name.replace(/'/g, "''")}', '${product.category}', '${product.unit}', ${product.selling_price}, ${product.cost_price}, '${product.barcode}');\n`;
    sql += `INSERT INTO store_inventory (product_id, stock_quantity, reorder_level, store_id) VALUES ('${masterId}', ${product.stock_quantity}, ${product.reorder_level}, '${storeId}');\n\n`;
  });

  return sql;
}

// Generate SQL for all products
const fullSQL = generateBatchInsertSQL(parsedProducts);
console.log('Full SQL for all products:');
console.log(fullSQL);

// Export for use
export { parsedProducts };
