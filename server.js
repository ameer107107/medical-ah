const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 5000;
const UPLOAD_DIR = 'uploads/products';
const EXPORT_JSON_PATH = path.join(__dirname, 'data/products.json');

// إنشاء قاعدة البيانات
const db = new sqlite3.Database('./database.sqlite');

// تهيئة قاعدة البيانات
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                primary_category TEXT NOT NULL,
                category TEXT NOT NULL,
                tertiary_category TEXT,
                name_ar TEXT NOT NULL,
                name_en TEXT,
                description_ar TEXT,
                description_en TEXT,
                price TEXT NOT NULL,
                image TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// 🌟 دالة تصدير المنتجات إلى JSON
function exportProductsToJSON() {
    db.all(`SELECT * FROM products ORDER BY created_at DESC`, (err, rows) => {
        if (err) {
            console.error('Error exporting products to JSON:', err.message);
            return;
        }

        const products = rows.map(row => ({
            id: row.id,
            primaryCategory: row.primary_category,
            category: row.category,
            tertiaryCategory: row.tertiary_category,
            name: { ar: row.name_ar, en: row.name_en },
            description: { ar: row.description_ar, en: row.description_en },
            price: row.price,
            image: row.image
        }));

        fs.mkdirSync(path.dirname(EXPORT_JSON_PATH), { recursive: true });
        fs.writeFileSync(EXPORT_JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
        console.log('✅ Products exported to JSON successfully');
    });
}

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// 📦 عرض جميع المنتجات
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY created_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const products = rows.map(row => ({
            id: row.id,
            primaryCategory: row.primary_category,
            category: row.category,
            tertiaryCategory: row.tertiary_category,
            name: { ar: row.name_ar, en: row.name_en },
            description: { ar: row.description_ar, en: row.description_en },
            price: row.price,
            image: row.image
        }));
        res.json(products);
    });
});

// ➕ إضافة منتج جديد
app.post('/api/products', (req, res) => {
    try {
        const { product, imageData } = req.body;
        let imagePath = product.image || '';

        // حفظ الصورة إن وجدت
        if (imageData) {
            const matches = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
            if (matches) {
                const ext = matches[1];
                const base64Data = matches[2];
                const filename = `${product.id || Date.now()}.${ext}`;
                const filepath = path.join(UPLOAD_DIR, filename);
                fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
                imagePath = `/uploads/products/${filename}`;
            }
        }

        db.run(`
            INSERT INTO products (
                id, primary_category, category, tertiary_category,
                name_ar, name_en, description_ar, description_en,
                price, image
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            product.id,
            product.primaryCategory,
            product.category,
            product.tertiaryCategory || null,
            product.name.ar,
            product.name.en || '',
            product.description.ar || '',
            product.description.en || '',
            product.price,
            imagePath
        ], (err) => {
            if (err) return res.status(400).json({ error: err.message });

            // تحديث JSON بعد الإضافة
            exportProductsToJSON();

            res.status(201).json({ ...product, image: imagePath });
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ✏️ تعديل منتج موجود
app.put('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    const { product, imageData } = req.body;
    let imagePath = product.image || '';

    // حفظ صورة جديدة إن وجدت
    if (imageData) {
        const matches = imageData.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (matches) {
            const ext = matches[1];
            const base64Data = matches[2];
            const filename = `${productId}.${ext}`;
            const filepath = path.join(UPLOAD_DIR, filename);
            fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
            imagePath = `/uploads/products/${filename}`;
        }
    }

    db.run(`
        UPDATE products
        SET primary_category = ?, category = ?, tertiary_category = ?,
            name_ar = ?, name_en = ?, description_ar = ?, description_en = ?,
            price = ?, image = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [
        product.primaryCategory,
        product.category,
        product.tertiaryCategory || null,
        product.name.ar,
        product.name.en || '',
        product.description.ar || '',
        product.description.en || '',
        product.price,
        imagePath,
        productId
    ], (err) => {
        if (err) return res.status(400).json({ error: err.message });

        // تحديث JSON بعد التعديل
        exportProductsToJSON();

        res.json({ ...product, id: productId, image: imagePath });
    });
});

// 🗑️ حذف منتج
app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;

    db.run(`DELETE FROM products WHERE id = ?`, [productId], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // تحديث JSON بعد الحذف
        exportProductsToJSON();

        res.sendStatus(200);
    });
});

setInterval(exportProductsToJSON, 5 * 60 * 1000); 


// أنشئ مجلد الرفع إن لم يكن موجود
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 🚀 تشغيل السيرفر
(async () => {
    await initializeDatabase();
    // تصدير أولي عند التشغيل
    exportProductsToJSON();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log('📡 Endpoints ready: GET, POST, PUT, DELETE');
    });
})();
