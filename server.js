import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const PRIVATE_DATA_DIR = path.join(process.cwd(), 'data');
const SOURCES_DIR = path.join(PRIVATE_DATA_DIR, 'sources');
const SOURCES_INDEX = path.join(PRIVATE_DATA_DIR, 'sources.json');
const adminSessions = new Map();

await fs.mkdir(SOURCES_DIR, { recursive: true });

// التحقق الصارم من وجود مفتاح API في البيئة
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ خطأ حرج: مفتاح GEMINI_API_KEY غير موجود في ملف .env");
    process.exit(1);
}

if (!ADMIN_PASSWORD) {
    console.warn("⚠️ تحذير: ADMIN_PASSWORD غير موجودة؛ ستبقى لوحة الإدارة مغلقة حتى إضافتها إلى ملف .env.");
}

// تهيئة عميل Google Gen AI الرسمي
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// إعدادات الوسائط والأمان
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static('public'));

app.get('/aicha-academy', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const aiUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // حد أقصى 10 ميغابايت للصورة أو الملف
});

const sourceUpload = multer({
    storage: multer.diskStorage({
        destination: SOURCES_DIR,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `${crypto.randomUUID()}${extension}`);
        }
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
});

async function readSources() {
    try {
        return JSON.parse(await fs.readFile(SOURCES_INDEX, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function writeSources(sources) {
    await fs.writeFile(SOURCES_INDEX, JSON.stringify(sources, null, 2), 'utf8');
}

function isPrivateAddress(address) {
    if (net.isIPv4(address)) {
        const [first, second] = address.split('.').map(Number);
        return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) || first === 0;
    }
    return net.isIPv6(address) && (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:'));
}

async function validatePublicUrl(rawUrl) {
    const parsedUrl = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('يسمح بروابط HTTP وHTTPS فقط.');
    }
    const addresses = await dns.lookup(parsedUrl.hostname, { all: true });
    if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
        throw new Error('لا يمكن إضافة رابط داخلي أو غير عام.');
    }
    return parsedUrl.toString();
}

function extractWebText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200000);
}

async function fetchPublicSource(rawUrl) {
    const url = await validatePublicUrl(rawUrl);
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`تعذر جلب الرابط (${response.status}).`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        throw new Error('الرابط لا يعيد صفحة نصية أو HTML قابلة للقراءة.');
    }
    const text = extractWebText(await response.text());
    if (!text) throw new Error('لم يتم العثور على نص قابل للقراءة في الرابط.');
    return { url, content: text };
}

async function generateTutorResponse(contents, config) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents,
                config
            });
        } catch (error) {
            const quotaExceeded = error.status === 429 && /quota exceeded|exceeded your current quota/i.test(error.message || '');
            const retryable = !quotaExceeded && (error.status === 429 || error.status === 503);
            if (!retryable || attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
        }
    }
}

function passwordsMatch(input) {
    const inputBuffer = Buffer.from(input || '');
    const passwordBuffer = Buffer.from(ADMIN_PASSWORD);
    return inputBuffer.length === passwordBuffer.length && crypto.timingSafeEqual(inputBuffer, passwordBuffer);
}

function requireAdmin(req, res, next) {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const session = token && adminSessions.get(token);

    if (!session || session.expiresAt < Date.now()) {
        if (token) adminSessions.delete(token);
        return res.status(401).json({ error: 'يجب تسجيل الدخول بصفتك مشرفاً.' });
    }

    next();
}

// مسار فحص الحالة والجاهزية
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', academy: 'Aicha Academy is running securely.' });
});

app.post('/api/admin/login', (req, res) => {
    if (!ADMIN_PASSWORD) {
        return res.status(503).json({ error: 'لوحة الإدارة غير مهيأة. أضف ADMIN_PASSWORD إلى ملف .env.' });
    }
    if (!passwordsMatch(req.body?.password)) {
        return res.status(401).json({ error: 'كلمة مرور المشرف غير صحيحة.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    res.json({ token });
});

app.get('/api/admin/sources', requireAdmin, async (req, res) => {
    res.json({ sources: await readSources() });
});

app.post('/api/admin/sources', requireAdmin, sourceUpload.single('source'), async (req, res) => {
    const title = String(req.body.title || '').trim();
    const sourceUrl = String(req.body.url || '').trim();
    if (!req.file && !sourceUrl) return res.status(400).json({ error: 'اختر ملفاً أو أدخل رابط مصدر.' });
    if (!title) {
        if (req.file) await fs.unlink(req.file.path);
        return res.status(400).json({ error: 'اسم المصدر مطلوب.' });
    }

    const sources = await readSources();
    const source = {
        id: crypto.randomUUID(),
        title,
        subject: String(req.body.subject || 'mathematics'),
        type: String(req.body.type || 'other'),
        kind: req.file ? 'file' : 'website',
        originalName: req.file?.originalname || null,
        storedName: req.file?.filename || null,
        url: null,
        content: null,
        size: req.file?.size || null,
        createdAt: new Date().toISOString()
    };

    if (sourceUrl) {
        try {
            const fetchedSource = await fetchPublicSource(sourceUrl);
            source.url = fetchedSource.url;
            source.content = fetchedSource.content;
        } catch (error) {
            if (req.file) await fs.unlink(req.file.path).catch(() => {});
            return res.status(400).json({ error: error.message });
        }
    }

    sources.push(source);
    await writeSources(sources);
    res.status(201).json({ source });
});

app.delete('/api/admin/sources/:id', requireAdmin, async (req, res) => {
    const sources = await readSources();
    const source = sources.find(item => item.id === req.params.id);
    if (!source) return res.status(404).json({ error: 'المصدر غير موجود.' });

    if (source.storedName) {
        await fs.unlink(path.join(SOURCES_DIR, source.storedName)).catch(error => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
    await writeSources(sources.filter(item => item.id !== source.id));
    res.status(204).end();
});

// مسار الأستاذ الذكي السقراطي
app.post('/api/ai', aiUpload.single('image'), async (req, res) => {
    try {
        const userMessage = req.body.message || '';
        const subject = req.body.subject || 'mathematics';
        const imageFile = req.file;
        const subjectNames = {
            mathematics: 'الرياضيات',
            physics: 'العلوم الفيزيائية',
            biology: 'علوم الطبيعة والحياة',
            english: 'اللغة الإنجليزية'
        };
        const currentSubjectName = subjectNames[subject] || subjectNames.mathematics;
        const sources = (await readSources()).filter(source => source.subject === subject);

        // توجيهات النظام الشخصية السقراطية (المنهاج الجزائري - جذع مشترك علوم)
        const systemInstruction = `أنت أستاذ ذكي وموجه تربوي خبير في المنهاج الدراسي الجزائري للسنة الأولى ثانوي (جذع مشترك علوم وتكنولوجيا). الجلسة الحالية مخصصة حصراً لمادة ${currentSubjectName}.
    التزم بالقواعد التالية في كل رد:
    1. التزم بموضوع مادة ${currentSubjectName} فقط. لا تقترح دروساً أو محاور أو تمارين من العلوم الفيزيائية أو علوم الطبيعة والحياة أو اللغة الإنجليزية أو أي مادة أخرى.
    2. قدّم معلومات صحيحة ودقيقة وقابلة للتحقق، ولا تخمّن ولا تختلق معلومة أو مرجعاً أو نتيجة.
    3. حلّل المعطيات خطوة بخطوة، وراجع العمليات الحسابية والوحدات والإشارات والنتيجة النهائية قبل إرسال الرد.
    4. إذا كانت المعطيات ناقصة أو السؤال غامضاً، اطلب التوضيح اللازم بدلاً من افتراض المعطيات.
    5. إذا لم تكن متأكداً من معلومة، صرّح بوضوح بعدم اليقين ولا تقدّمها كحقيقة.
    6. اشرح سبب الإجابة بطريقة تعليمية، ووجّه الطالب(ة) بأسئلة استنتاجية عند ملاءمة ذلك، وقدّم الحل الصحيح المعلّل عند طلبه أو عند الحاجة.
    7. التزم بالمنهاج والمراجع العلمية المعتمدة، وميّز بين الحقيقة والاستنتاج والرأي.
    8. اكتب وتحدث بالعربية الفصحى المعاصرة فقط، بعبارات سليمة وواضحة ومهذبة. امتنع تماماً عن اللهجات المحلية والتعابير العامية والمبتذلة والاختصارات الدارجة.
    9. في المحتوى العلمي استخدم الأرقام الغربية الدولية فقط: 0 1 2 3 4 5 6 7 8 9. لا تستخدم الأرقام العربية المشرقية مثل ٠ ١ ٢ ٣. استخدم النقطة للفاصلة العشرية، مثل 3.14.
    10. استخدم الرموز الرياضية العالمية القياسية: + − × ÷ = ≠ ± < > ≤ ≥ ≈ √ ∛ ∈ ∉ ⊂ ⊆ ∪ ∩ ∀ ∃ ⇒ ⇔ ¬ ∑ ∏ ∫ π α β θ λ μ. اكتب الكسور المتصلة بصيغة a/b، والمجالات بصيغة ]a, b[ أو [a, b] أو [a, b[، وافصل المعادلات عن النص العربي بمسافات واضحة.
    11. في الفيزياء استخدم الوحدات الدولية اللاتينية كما هي: m, kg, s, N, J, W, Pa, Hz, °C. اكتب الكتابة العلمية مثل 3×10⁻²، ومثّل المتجه بسهم أو بخط عريض عند الإمكان.
    12. في علوم الطبيعة والحياة اكتب الصيغ الكيميائية بأرقام سفلية مثل H₂O وCO₂ وO₂، ومعادلات التفاعل بالرمزين → و⇌، والشحنات بأس علوي مثل Na⁺ وSO₄²⁻.
    13. اكتب الأرقام والمعادلات من اليسار إلى اليمين دون عكس ترتيبها، ولا تخترع رموزاً عربية بديلة عن الرموز العالمية.
    14. خاطب المتعلم(ة) بعبارات فصيحة قياسية مثل: يا بني(ة)، يا عزيزي(ة)، يا بطل(ة). لا تذكر أي اسم شخصي نهائياً في ردودك.
    15. استخدم المصادر المرفقة في الطلب عند ارتباطها بالسؤال. اذكر اسم المصدر دائماً.
    16. إذا نقلت تمريناً أو معلومة من كتاب مدرسي، اذكر رقم الصفحة فقط إذا ظهر بوضوح في الملف أو السياق. لا تخترع رقم صفحة أبداً.
    17. لا تعتبر محتوى المواقع المفتوحة صحيحاً تلقائياً؛ قارنه بالكتاب المدرسي والمراجع الرسمية، واذكر بوضوح عندما يكون المصدر موقعاً إلكترونياً.`;

        let contents = [];

        // إذا تم إرفاق صورة تمرين أو كراس
        if (imageFile) {
            contents.push({
                inlineData: {
                    data: imageFile.buffer.toString('base64'),
                    mimeType: imageFile.mimetype
                }
            });
        }

        const relevantSources = sources.slice(0, 4);
        for (const source of relevantSources) {
            if (source.content) {
                contents.push(`مصدر إلكتروني: ${source.title}\nالرابط: ${source.url}\nالمحتوى:\n${source.content}`);
            } else if ((source.kind === 'file' || !source.kind) && source.storedName && source.size <= 10 * 1024 * 1024) {
                const sourcePath = path.join(SOURCES_DIR, source.storedName);
                const sourceData = await fs.readFile(sourcePath);
                const extension = path.extname(source.originalName || source.storedName).toLowerCase();
                if (extension === '.pdf') {
                    contents.push({
                        inlineData: {
                            data: sourceData.toString('base64'),
                            mimeType: 'application/pdf'
                        }
                    });
                    contents.push(`هذا كتاب أو ملف PDF بعنوان: ${source.title}. استخرج رقم الصفحة من الملف نفسه فقط.`);
                } else if (['.txt', '.md', '.html', '.htm'].includes(extension)) {
                    contents.push(`ملف مصدر بعنوان: ${source.title}\nالمحتوى:\n${sourceData.toString('utf8').slice(0, 200000)}`);
                }
            }
        }

        contents.push(userMessage || 'سؤال عام حول الدرس، وجهني من فضلك.');

        // استدعاء نموذج Gemini الحديث عبر الحزمة الرسمية
        const response = await generateTutorResponse(contents, {
            systemInstruction,
            temperature: 0.2
        });

        // استخراج النص من الخاصية الصحيحة (response.text)
        const replyText = response.text || 'عذراً، لم أتمكن من صياغة الرد، حاولي مرة أخرى.';

        res.json({ reply: replyText });

    } catch (error) {
        console.error('Server AI Error:', error);
        if (error.status === 429 && /quota exceeded|exceeded your current quota/i.test(error.message || '')) {
            return res.status(503).json({ error: 'تم بلوغ الحد المجاني لخدمة الأستاذ الذكي. يرجى المحاولة لاحقاً أو تفعيل الفوترة في حساب Gemini.' });
        }
        if (error.status === 429 || error.status === 503) {
            return res.status(503).json({ error: 'خدمة الأستاذ مشغولة حالياً. حاولي إرسال السؤال بعد لحظات.' });
        }
        res.status(500).json({ error: 'حدث خطأ داخلي في الخادم أثناء معالجة السؤال الذكي.' });
    }
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ error: error.message });
    }
    next(error);
});

// تشغيل الخادم
app.listen(PORT, HOST, () => {
    console.log(`🚀 Aicha Academy Server is running successfully on http://${HOST}:${PORT}/aicha-academy`);
});