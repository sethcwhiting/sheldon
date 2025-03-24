import { config } from "https://deno.land/x/dotenv/mod.ts";
import { assert } from "https://deno.land/std@0.219.1/testing/asserts.ts";

// Load environment variables from .env file
const env = config();

// Get the API token from the environment
const apiToken = env.PRINTFUL_API_TOKEN;
assert(apiToken, "PRINTFUL_API_TOKEN not set in environment");

interface PrintfulVariant {
  id: number;
  product_id: number;
  name: string;
  retail_price: string;
}

interface PrintfulProduct {
  id: number;
  type: string;
  name: string;
  brand: string | null;
  model: string | null;
  variant_count: number;
  variants: PrintfulVariant[];
}

interface PrintfulCatalogResponse {
  code: number;
  result: {
    data: Array<{
      id: number;
      name: string;
      variants: Array<{
        id: number;
        name: string;
        retail_price: string;
      }>;
    }>;
  };
}

// First, fetch the catalog products
const response = await fetch('https://api.printful.com/v2/catalog-products', {
  headers: {
    'Authorization': `Bearer ${apiToken}`
  }
});

if (!response.ok) {
  console.error('Failed to fetch products');
  console.error('Response status:', response.status);
  console.error('Response text:', await response.text());
  Deno.exit(1);
}

const data = await response.json();
console.log('API Response:', JSON.stringify(data, null, 2));

// Get the products array
const products = data.data;
if (!Array.isArray(products)) {
  console.error('Expected products to be an array');
  console.error('Got:', typeof products);
  Deno.exit(1);
}

// Debug variants
for (const product of products) {
  if (product.name === 'Unisex Basic Softstyle T-Shirt | Gildan 64000') {
    console.log('Product:', JSON.stringify(product, null, 2));
  }
}

// Log the keys of the first object in the array
if (products.length > 0) {
    const firstProduct = products[0];
    console.log('Keys of the first object in the array:');
    Object.keys(firstProduct).forEach(key => console.log(key));
}

// Select the third product
const selectedProduct = products[2];
const selectedName = selectedProduct.name;
const selectedId = selectedProduct.id;

// Get variants for the selected product
const variantResponse = await fetch(`https://api.printful.com/v2/catalog-products/${selectedId}/catalog-variants`, {
  headers: {
    'Authorization': `Bearer ${apiToken}`
  }
});

if (!variantResponse.ok) {
  console.error(`Failed to fetch variants for ${selectedName}`);
  console.error('Response status:', variantResponse.status);
  console.error('Response text:', await variantResponse.text());
  Deno.exit(1);
}

const variantData = await variantResponse.json();
console.log('Variant data:', JSON.stringify(variantData, null, 2));

const variants = variantData.data;
if (!variants || variants.length === 0) {
  console.error(`No variants found for ${selectedName}`);
  Deno.exit(1);
}

// Get image files in current directory
const imageFiles = [];
for await (const entry of Deno.readDir('.')) {
  if (entry.isFile && (entry.name.endsWith('.png') || entry.name.endsWith('.jpg'))) {
    imageFiles.push(entry.name);
  }
}

if (imageFiles.length === 0) {
  console.error('No image files found in current directory');
  Deno.exit(1);
}

const imageFileName = imageFiles[0];
console.log(`Using image file: ${imageFileName}`);

try {
  // Get store info first
  console.log('Getting store info...');
  const storeResponse = await fetch('https://api.printful.com/stores', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiToken}`
    }
  });

  const storeResult = await storeResponse.json();
  console.log('Store result:', storeResult);

  if (!storeResult.result?.[0]?.id) {
    throw new Error('Failed to get store ID');
  }

  const _storeId = storeResult.result[0].id;

  // Upload the file first
  console.log('Uploading file:', imageFileName);
  const fileBytes = await Deno.readFile(imageFileName);
  const fileBlob = new Blob([fileBytes], { type: 'image/png' });

  const formData = new FormData();
  formData.append('file', fileBlob, imageFileName);

  const fileUploadResponse = await fetch(`https://api.printful.com/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`
    },
    body: formData
  });

  const responseText = await fileUploadResponse.text();
  console.log('Raw response:', responseText);
  
  const fileUploadResult = JSON.parse(responseText);
  console.log('File upload result:', fileUploadResult);

  if (!fileUploadResult.result?.id) {
    throw new Error('Failed to get file ID from upload response');
  }

  // Create sync product with the uploaded file
  const syncProductResponse = await fetch(`https://api.printful.com/sync/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sync_product: {
        external_id: 'canvas-print-1',
        name: 'Canvas Print',
        variants: [{
          external_id: 'canvas-print-1-24x24',
          variant_id: 19313,
          retail_price: '29.99',
          files: [{
            type: 'default',
            url: fileUploadResult.result.url
          }]
        }]
      }
    })
  });

  const syncProductResult = await syncProductResponse.json();
  console.log('Sync product result:', syncProductResult);
} catch (error) {
  console.error(`Error syncing ${selectedName}:`, error);
  Deno.exit(1);
}

console.log('Sync process completed!');